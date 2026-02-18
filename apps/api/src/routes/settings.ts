import { Hono } from "hono";
import { db } from "../db/client";

export const settingsRoutes = new Hono();

// Save Claude API key
settingsRoutes.post("/apikey", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { anthropic_api_key } = await c.req.json();
  if (!anthropic_api_key?.startsWith("sk-ant-")) {
    return c.json({ error: "Invalid Claude API key — must start with sk-ant-" }, 400);
  }

  // Upsert user with key
  await db.from("users").upsert(
    { id: userId, email: "", anthropic_api_key },
    { onConflict: "id" }
  );

  return c.json({ ok: true });
});

// Check if user has API key set
settingsRoutes.get("/apikey/status", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { data } = await db
    .from("users")
    .select("anthropic_api_key")
    .eq("id", userId)
    .single();

  return c.json({ hasKey: !!data?.anthropic_api_key });
});
