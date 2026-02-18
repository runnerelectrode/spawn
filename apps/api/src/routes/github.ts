import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";
import { db } from "../db/client";
import { deployQueue } from "../workers/queues";

export const githubRoutes = new Hono();

const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// ─── GitHub App OAuth callback ─────────────────────────────────────────────

githubRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state"); // user_id encoded in state

  if (!code) return c.json({ error: "Missing code" }, 400);

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData: any = await tokenRes.json();

  if (tokenData.error) {
    return c.json({ error: tokenData.error_description }, 400);
  }

  // Get GitHub user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${tokenData.access_token}` },
  });
  const githubUser: any = await userRes.json();

  // Upsert user record
  await db.from("users").upsert(
    { id: state, github_username: githubUser.login },
    { onConflict: "id" }
  );

  return c.redirect(`${process.env.WEB_BASE_URL}/dashboard?connected=github`);
});

// ─── GitHub App installation callback ──────────────────────────────────────

githubRoutes.get("/installed", async (c) => {
  const installationId = c.req.query("installation_id");
  const userId = c.req.query("state");

  if (!installationId || !userId) return c.json({ error: "Missing params" }, 400);

  await db
    .from("users")
    .update({ github_installation_id: parseInt(installationId) })
    .eq("id", userId);

  return c.redirect(`${process.env.WEB_BASE_URL}/dashboard?installed=true`);
});

// ─── GitHub Webhook receiver ───────────────────────────────────────────────

githubRoutes.post("/webhook", async (c) => {
  const signature = c.req.header("x-hub-signature-256") ?? "";
  const body = await c.req.text();

  // Verify signature
  const valid = await webhooks.verify(body, signature);
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  const event = c.req.header("x-github-event");
  const payload = JSON.parse(body);

  if (event === "push") {
    await handlePushEvent(payload);
  }

  return c.json({ ok: true });
});

async function handlePushEvent(payload: any) {
  const repoFullName: string = payload.repository.full_name;
  const commitSha: string = payload.after;
  const commitMessage: string = payload.head_commit?.message ?? "";
  const installationId: number = payload.installation?.id;

  if (!installationId) return;

  // Find apps that watch this repo with auto_deploy enabled
  const { data: apps } = await db
    .from("apps")
    .select("id, user_id")
    .eq("repo_full_name", repoFullName)
    .eq("auto_deploy", true);

  if (!apps || apps.length === 0) return;

  for (const app of apps) {
    // Create deployment record
    const { data: deployment } = await db
      .from("deployments")
      .insert({
        app_id: app.id,
        commit_sha: commitSha,
        commit_message: commitMessage,
        status: "queued",
      })
      .select()
      .single();

    if (!deployment) continue;

    // Update app status
    await db.from("apps").update({ status: "analyzing" }).eq("id", app.id);

    // Enqueue deploy job
    await deployQueue.add("deploy", {
      app_id: app.id,
      deployment_id: deployment.id,
      repo_url: `https://github.com/${repoFullName}`,
      repo_full_name: repoFullName,
      commit_sha: commitSha,
      installation_id: installationId,
    });
  }
}
