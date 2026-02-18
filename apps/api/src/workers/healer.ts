import cron from "node-cron";
import { db } from "../db/client";
import { diagnoseCrash } from "../agents/analyzer";
import { buildRepoSnapshot } from "../services/github";
import {
  restartMachine,
  scaleMachineMemory,
  destroyMachine,
  deployMachine,
  getMachineLogs,
  getAppUrl,
} from "../services/fly";
import { notifyUser, healActionEmail } from "../services/notifications";
import { deployQueue } from "./queues";

// Track consecutive failures per machine
const failureCount: Record<string, number> = {};

export function startHealthChecker() {
  // Check every 30 seconds
  cron.schedule("*/30 * * * * *", checkAllApps);
  console.log("Health checker started (every 30s)");
}

async function checkAllApps() {
  const { data: apps } = await db
    .from("apps")
    .select("*")
    .in("status", ["running", "crashed", "healing"]);

  if (!apps) return;

  await Promise.allSettled(apps.map(checkApp));
}

async function checkApp(app: any) {
  if (!app.url || !app.fly_machine_id) return;

  const healthUrl = `${app.url}/health`;
  let responseMs: number | null = null;
  let isHealthy = false;

  try {
    const start = Date.now();
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
    responseMs = Date.now() - start;
    isHealthy = res.status < 500;
  } catch {
    isHealthy = false;
  }

  // Get memory stats from Fly
  let memoryMb: number | null = null;
  let memoryPct: number | null = null;
  try {
    const stats = await getFlyMemoryStats(app.fly_app_name, app.fly_machine_id);
    memoryMb = stats.memoryMb;
    memoryPct = stats.memoryPct;
  } catch {
    // Memory stats are best-effort
  }

  // Log health check
  const status = isHealthy ? (memoryPct && memoryPct > 85 ? "degraded" : "healthy") : "down";
  await db.from("health_checks").insert({
    app_id: app.id,
    status,
    response_ms: responseMs,
    memory_mb: memoryMb,
    memory_pct: memoryPct,
  });

  // Handle degraded memory — scale proactively
  if (status === "degraded" && memoryPct && memoryPct > 85) {
    const newRam = Math.ceil(app.ram_mb * 1.5 / 256) * 256; // round up to next 256MB
    await healScaleMemory(app, newRam, `Memory at ${memoryPct}% — scaling to ${newRam}MB`);
    return;
  }

  if (isHealthy) {
    failureCount[app.id] = 0;
    if (app.status !== "running") {
      await db.from("apps").update({ status: "running" }).eq("id", app.id);
    }
    return;
  }

  // App is down
  failureCount[app.id] = (failureCount[app.id] ?? 0) + 1;
  const failures = failureCount[app.id];

  console.log(`[healer] ${app.name} down — failure #${failures}`);

  if (failures <= 2) {
    // Simple restart
    await healRestart(app);
  } else {
    // 3+ failures — escalate to Claude
    await healWithClaude(app);
    failureCount[app.id] = 0;
  }
}

async function healRestart(app: any) {
  console.log(`[healer] Restarting ${app.name}`);
  await db.from("apps").update({ status: "healing" }).eq("id", app.id);

  try {
    await restartMachine(app.fly_app_name, app.fly_machine_id);
    await logHealEvent(app.id, "restart", "App was unresponsive", null, null);
  } catch (e: any) {
    console.error(`[healer] Restart failed for ${app.name}:`, e.message);
  }
}

async function healScaleMemory(app: any, newRamMb: number, reason: string) {
  console.log(`[healer] Scaling ${app.name} memory to ${newRamMb}MB`);
  await db.from("apps").update({ status: "healing" }).eq("id", app.id);

  try {
    await scaleMachineMemory(app.fly_app_name, app.fly_machine_id, newRamMb);
    await db.from("apps").update({ ram_mb: newRamMb, status: "running" }).eq("id", app.id);
    await logHealEvent(app.id, "scale_memory", reason, `Scaled to ${newRamMb}MB`, newRamMb);

    await notifyUser(
      app.user_id,
      `⚡ Auto-scaled ${app.name}`,
      healActionEmail(app.name, "Memory Scale", reason)
    );
  } catch (e: any) {
    console.error(`[healer] Scale failed for ${app.name}:`, e.message);
  }
}

async function healWithClaude(app: any) {
  console.log(`[healer] Escalating ${app.name} to Claude...`);
  await db.from("apps").update({ status: "healing" }).eq("id", app.id);

  try {
    // Get crash logs
    const crashLogs = await getMachineLogs(app.fly_app_name, app.fly_machine_id, 200);

    // Get last deployment's dockerfile
    const { data: lastDeploy } = await db
      .from("deployments")
      .select("dockerfile, analysis")
      .eq("app_id", app.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    const currentDockerfile = lastDeploy?.dockerfile ?? "";

    // Get repo snapshot for Claude context
    const { cloneOrPullRepo, buildRepoSnapshot } = await import("../services/github");
    const { data: user } = await db
      .from("users")
      .select("github_installation_id")
      .eq("id", app.user_id)
      .single();

    const repoDir = await cloneOrPullRepo(
      app.repo_full_name,
      user?.github_installation_id ?? 0
    );
    const snapshot = await buildRepoSnapshot(repoDir);

    // Ask Claude what to do
    const healAction = await diagnoseCrash(snapshot, crashLogs, currentDockerfile, app.ram_mb);
    console.log(`[healer] Claude says: ${healAction.type} — ${healAction.reason}`);

    await logHealEvent(
      app.id,
      healAction.type,
      healAction.reason,
      healAction.fix_description,
      healAction.new_ram_mb
    );

    switch (healAction.type) {
      case "restart":
        await restartMachine(app.fly_app_name, app.fly_machine_id);
        await db.from("apps").update({ status: "running" }).eq("id", app.id);
        break;

      case "scale_memory":
        const newRam = healAction.new_ram_mb ?? app.ram_mb * 2;
        await scaleMachineMemory(app.fly_app_name, app.fly_machine_id, newRam);
        await db.from("apps").update({ ram_mb: newRam, status: "running" }).eq("id", app.id);
        break;

      case "redeploy_with_fix":
        // Re-queue deploy — the next run will use the patched dockerfile
        if (healAction.dockerfile_patch) {
          // Store patch in app metadata so deploy worker picks it up
          await db.from("apps").update({
            env_vars: { ...app.env_vars, _SPAWN_DOCKERFILE_PATCH: healAction.dockerfile_patch },
          }).eq("id", app.id);
        }
        const { data: latestDeploy } = await db
          .from("deployments")
          .select("commit_sha, commit_message")
          .eq("app_id", app.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (latestDeploy && user?.github_installation_id) {
          const { data: newDeployment } = await db.from("deployments").insert({
            app_id: app.id,
            commit_sha: latestDeploy.commit_sha,
            commit_message: `[auto-heal] ${healAction.fix_description}`,
            status: "queued",
          }).select().single();

          if (newDeployment) {
            await deployQueue.add("deploy", {
              app_id: app.id,
              deployment_id: newDeployment.id,
              repo_url: `https://github.com/${app.repo_full_name}`,
              repo_full_name: app.repo_full_name,
              commit_sha: latestDeploy.commit_sha,
              installation_id: user.github_installation_id,
            });
          }
        }
        break;

      case "notify_only":
        await db.from("apps").update({ status: "crashed" }).eq("id", app.id);
        break;
    }

    await notifyUser(
      app.user_id,
      `⚡ Auto-healed ${app.name}`,
      healActionEmail(
        app.name,
        healAction.type,
        healAction.fix_description ?? healAction.reason
      )
    );

  } catch (e: any) {
    console.error(`[healer] Claude heal failed for ${app.name}:`, e.message);
    await db.from("apps").update({ status: "crashed" }).eq("id", app.id);
  }
}

async function logHealEvent(
  appId: string,
  action: string,
  reason: string,
  fixDescription: string | null,
  newRamMb: number | null
) {
  await db.from("heal_events").insert({
    app_id: appId,
    action,
    reason,
    fix_description: fixDescription,
    new_ram_mb: newRamMb,
  });
}

// Best-effort memory stats via Fly metrics API
async function getFlyMemoryStats(
  appName: string,
  machineId: string
): Promise<{ memoryMb: number; memoryPct: number }> {
  // Fly exposes Prometheus metrics at https://api.fly.io/prometheus/{org}
  // This is a placeholder — wire up actual Prometheus scrape if needed
  return { memoryMb: 0, memoryPct: 0 };
}
