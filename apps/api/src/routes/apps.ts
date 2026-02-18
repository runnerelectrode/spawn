import { Hono } from "hono";
import { db } from "../db/client";
import { deployQueue } from "../workers/queues";
import { deleteFlyApp } from "../services/fly";

export const appsRoutes = new Hono();

// List all apps for a user
appsRoutes.get("/", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await db
    .from("apps")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// Get single app
appsRoutes.get("/:id", async (c) => {
  const { data, error } = await db
    .from("apps")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json(data);
});

// Create app (first-time connect)
appsRoutes.post("/", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { repo_url, name, env_vars = {}, region = "iad" } = body;

  if (!repo_url || !name) return c.json({ error: "repo_url and name are required" }, 400);

  // Extract repo full name from URL
  const match = repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) return c.json({ error: "Invalid GitHub URL" }, 400);
  const repoFullName = match[1];

  const { data: app, error } = await db
    .from("apps")
    .insert({
      user_id: userId,
      name,
      repo_url,
      repo_full_name: repoFullName,
      env_vars,
      region,
      status: "pending",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(app, 201);
});

// Trigger manual deploy
appsRoutes.post("/:id/deploy", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { data: app } = await db
    .from("apps")
    .select("*")
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .single();

  if (!app) return c.json({ error: "App not found" }, 404);

  const { data: user } = await db
    .from("users")
    .select("github_installation_id")
    .eq("id", userId)
    .single();

  if (!user?.github_installation_id) {
    return c.json({ error: "GitHub not connected" }, 400);
  }

  // Get latest commit
  const { getInstallationOctokit, getLatestCommit } = await import("../services/github");
  const octokit = await getInstallationOctokit(user.github_installation_id);
  const [owner, repo] = app.repo_full_name.split("/");
  const commit = await getLatestCommit(octokit, owner, repo);

  // Create deployment record
  const { data: deployment } = await db
    .from("deployments")
    .insert({
      app_id: app.id,
      commit_sha: commit.sha,
      commit_message: commit.message,
      status: "queued",
    })
    .select()
    .single();

  if (!deployment) return c.json({ error: "Could not create deployment" }, 500);

  // Enqueue
  await deployQueue.add("deploy", {
    app_id: app.id,
    deployment_id: deployment.id,
    repo_url: app.repo_url,
    repo_full_name: app.repo_full_name,
    commit_sha: commit.sha,
    installation_id: user.github_installation_id,
  });

  await db.from("apps").update({ status: "analyzing" }).eq("id", app.id);
  return c.json({ deployment_id: deployment.id, status: "queued" });
});

// Update env vars
appsRoutes.patch("/:id/env", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { env_vars } = await c.req.json();
  const { data, error } = await db
    .from("apps")
    .update({ env_vars })
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// Delete app
appsRoutes.delete("/:id", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { data: app } = await db
    .from("apps")
    .select("fly_app_name")
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .single();

  if (!app) return c.json({ error: "Not found" }, 404);

  if (app.fly_app_name) {
    await deleteFlyApp(app.fly_app_name).catch(console.error);
  }

  await db.from("apps").delete().eq("id", c.req.param("id"));
  return c.json({ ok: true });
});
