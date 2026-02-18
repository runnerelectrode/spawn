import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/client";

export const logsRoutes = new Hono();

// Stream deployment logs via SSE (Server-Sent Events)
logsRoutes.get("/deployment/:id/stream", async (c) => {
  const deploymentId = c.req.param("id");

  return streamSSE(c, async (stream) => {
    let lastCount = 0;
    let finished = false;

    while (!finished) {
      const { data } = await db
        .from("deployments")
        .select("logs, status")
        .eq("id", deploymentId)
        .single();

      if (!data) break;

      const newLogs = data.logs.slice(lastCount);
      for (const log of newLogs) {
        await stream.writeSSE({ data: log, event: "log" });
      }
      lastCount = data.logs.length;

      if (data.status === "success" || data.status === "failed") {
        await stream.writeSSE({ data: data.status, event: "done" });
        finished = true;
      }

      if (!finished) await new Promise((r) => setTimeout(r, 1000));
    }
  });
});

// Get all logs for a deployment (snapshot)
logsRoutes.get("/deployment/:id", async (c) => {
  const { data, error } = await db
    .from("deployments")
    .select("logs, status")
    .eq("id", c.req.param("id"))
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json(data);
});

// Get heal events for an app
logsRoutes.get("/app/:appId/heals", async (c) => {
  const { data } = await db
    .from("heal_events")
    .select("*")
    .eq("app_id", c.req.param("appId"))
    .order("triggered_at", { ascending: false })
    .limit(50);

  return c.json(data ?? []);
});
