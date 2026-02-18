import { Worker } from "bullmq";
import { writeFileSync } from "fs";
import { join } from "path";
import type { DeployJobPayload } from "@spawn/shared";
import { analyzeRepo } from "../agents/analyzer";
import { cloneOrPullRepo, buildRepoSnapshot } from "../services/github";
import {
  createFlyApp,
  deployMachine,
  destroyMachine,
  getAppUrl,
} from "../services/fly";
import { db } from "../db/client";
import { notifyUser, deploySuccessEmail, deployFailedEmail } from "../services/notifications";

const redisConnection = {
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: parseInt(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port || "6379"),
};

async function log(deploymentId: string, message: string) {
  console.log(`[deploy:${deploymentId}] ${message}`);
  await db.rpc("append_deploy_log", { deployment_id: deploymentId, message });
}

export const deployWorker = new Worker<DeployJobPayload>(
  "deploy",
  async (job) => {
    const { app_id, deployment_id, repo_full_name, commit_sha, installation_id } = job.data;

    // Fetch app record
    const { data: app } = await db.from("apps").select("*").eq("id", app_id).single();
    if (!app) throw new Error(`App ${app_id} not found`);

    try {
      // ── Step 1: Update status ────────────────────────────────────────────
      await db.from("deployments").update({ status: "running" }).eq("id", deployment_id);
      await db.from("apps").update({ status: "analyzing" }).eq("id", app_id);
      await log(deployment_id, "Cloning repository...");

      // ── Step 2: Clone repo ───────────────────────────────────────────────
      const repoDir = await cloneOrPullRepo(repo_full_name, installation_id, commit_sha);
      await log(deployment_id, `Repository cloned to ${repoDir}`);

      // ── Step 3: Claude analysis ──────────────────────────────────────────
      await db.from("apps").update({ status: "analyzing" }).eq("id", app_id);
      await log(deployment_id, "Analyzing repo with Claude Opus 4.6...");
      const snapshot = await buildRepoSnapshot(repoDir);
      const analysis = await analyzeRepo(snapshot);

      await log(deployment_id, `Framework: ${analysis.framework} | RAM: ${analysis.ram_mb}MB | Port: ${analysis.port}`);
      await log(deployment_id, `Summary: ${analysis.summary}`);

      if (analysis.blockers.length > 0) {
        await log(deployment_id, `Blockers: ${analysis.blockers.join(", ")}`);
      }

      // Save analysis to deployment
      await db.from("deployments").update({ analysis, dockerfile: analysis.dockerfile }).eq("id", deployment_id);

      // Update app with Claude's resource recommendations
      await db.from("apps").update({
        framework: analysis.framework,
        ram_mb: analysis.ram_mb,
        cpu_count: analysis.cpu_count,
        status: "building",
      }).eq("id", app_id);

      // ── Step 4: Write Dockerfile ─────────────────────────────────────────
      const dockerfilePath = join(repoDir, "Dockerfile");
      writeFileSync(dockerfilePath, analysis.dockerfile);
      await log(deployment_id, "Dockerfile written");

      // ── Step 5: Ensure Fly app exists ────────────────────────────────────
      const flyAppName = app.fly_app_name ?? `spawn-${app_id.slice(0, 8)}`;
      if (!app.fly_app_name) {
        await createFlyApp(flyAppName);
        await db.from("apps").update({ fly_app_name: flyAppName }).eq("id", app_id);
        await log(deployment_id, `Created Fly app: ${flyAppName}`);
      }

      // ── Step 6: Build & push image ───────────────────────────────────────
      await db.from("apps").update({ status: "building" }).eq("id", app_id);
      await log(deployment_id, "Building Docker image (remote builder)...");

      const { buildAndPushImage } = await import("../services/fly");
      const imageRef = await buildAndPushImage(flyAppName, repoDir, dockerfilePath);
      await log(deployment_id, `Image pushed: ${imageRef}`);

      // ── Step 7: Destroy old machine if exists ────────────────────────────
      if (app.fly_machine_id) {
        await log(deployment_id, "Removing old machine...");
        await destroyMachine(flyAppName, app.fly_machine_id).catch((e) =>
          log(deployment_id, `Warning: could not destroy old machine: ${e.message}`)
        );
      }

      // ── Step 8: Deploy new machine ───────────────────────────────────────
      await db.from("apps").update({ status: "deploying" }).eq("id", app_id);
      await log(deployment_id, `Deploying machine (${analysis.ram_mb}MB RAM)...`);

      const machineId = await deployMachine({
        appName: flyAppName,
        imageRef,
        region: app.region ?? "iad",
        ramMb: analysis.ram_mb,
        cpuCount: analysis.cpu_count,
        port: analysis.port,
        envVars: { ...app.env_vars, PORT: String(analysis.port) },
        healthEndpoint: analysis.health_endpoint ?? "/health",
      });

      // ── Step 9: Wait for healthy ─────────────────────────────────────────
      await log(deployment_id, "Waiting for app to become healthy...");
      const url = getAppUrl(flyAppName);
      await waitForHealthy(url, analysis.health_endpoint ?? "/health", 120);
      await log(deployment_id, `App is live at ${url}`);

      // ── Step 10: Update records ──────────────────────────────────────────
      await db.from("apps").update({
        fly_machine_id: machineId,
        status: "running",
        url,
      }).eq("id", app_id);

      await db.from("deployments").update({
        status: "success",
        finished_at: new Date().toISOString(),
      }).eq("id", deployment_id);

      // ── Step 11: Notify user ─────────────────────────────────────────────
      await notifyUser(
        app.user_id,
        `✓ ${app.name} is live`,
        deploySuccessEmail(app.name, url, job.data.commit_sha.slice(0, 7))
      );

    } catch (err: any) {
      const errorMsg = err.message ?? String(err);
      await log(deployment_id, `FAILED: ${errorMsg}`);

      await db.from("deployments").update({
        status: "failed",
        error: errorMsg,
        finished_at: new Date().toISOString(),
      }).eq("id", deployment_id);

      await db.from("apps").update({ status: "crashed" }).eq("id", app_id);

      await notifyUser(
        app.user_id,
        `✗ Deploy failed — ${app.name}`,
        deployFailedEmail(app.name, errorMsg)
      );

      throw err;
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

async function waitForHealthy(
  baseUrl: string,
  healthPath: string,
  timeoutSeconds: number
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}${healthPath}`, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) return;
    } catch {
      // Not up yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`App did not become healthy within ${timeoutSeconds}s`);
}
