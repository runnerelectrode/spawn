import { Hono } from "hono";
import { db } from "../db/client";

export const deployRoutes = new Hono();

// Get deployment details
deployRoutes.get("/:id", async (c) => {
  const { data, error } = await db
    .from("deployments")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json(data);
});

// List deployments for an app
deployRoutes.get("/app/:appId", async (c) => {
  const { data, error } = await db
    .from("deployments")
    .select("id, commit_sha, commit_message, status, started_at, finished_at, error")
    .eq("app_id", c.req.param("appId"))
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});
