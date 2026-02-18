import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { githubRoutes } from "./routes/github";
import { deployRoutes } from "./routes/deploy";
import { appsRoutes } from "./routes/apps";
import { logsRoutes } from "./routes/logs";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.WEB_BASE_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/github", githubRoutes);
app.route("/deploy", deployRoutes);
app.route("/apps", appsRoutes);
app.route("/logs", logsRoutes);

const port = parseInt(process.env.PORT ?? "3001");
console.log(`Spawn API running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
