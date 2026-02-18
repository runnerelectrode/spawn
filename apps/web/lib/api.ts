import { supabase } from "./supabase";
import type { SpawnApp, Deployment } from "@spawn/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  return userId ? { "x-user-id": userId } : {};
}

export async function getApps(): Promise<SpawnApp[]> {
  const res = await fetch(`${API}/apps`, { headers: await authHeaders() });
  return res.json();
}

export async function getApp(id: string): Promise<SpawnApp> {
  const res = await fetch(`${API}/apps/${id}`, { headers: await authHeaders() });
  return res.json();
}

export async function createApp(data: {
  repo_url: string;
  name: string;
  env_vars?: Record<string, string>;
  region?: string;
}): Promise<SpawnApp> {
  const res = await fetch(`${API}/apps`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function triggerDeploy(appId: string): Promise<{ deployment_id: string }> {
  const res = await fetch(`${API}/apps/${appId}/deploy`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

export async function getDeployments(appId: string): Promise<Deployment[]> {
  const res = await fetch(`${API}/deploy/app/${appId}`, {
    headers: await authHeaders(),
  });
  return res.json();
}

export async function updateEnvVars(appId: string, env_vars: Record<string, string>) {
  const res = await fetch(`${API}/apps/${appId}/env`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ env_vars }),
  });
  return res.json();
}

export async function deleteApp(appId: string) {
  await fetch(`${API}/apps/${appId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
}

export function streamDeployLogs(
  deploymentId: string,
  onLog: (line: string) => void,
  onDone: (status: string) => void
): () => void {
  const es = new EventSource(`${API}/logs/deployment/${deploymentId}/stream`);
  es.addEventListener("log", (e) => onLog(e.data));
  es.addEventListener("done", (e) => { onDone(e.data); es.close(); });
  es.onerror = () => es.close();
  return () => es.close();
}

export function githubInstallUrl(userId: string): string {
  const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME ?? "spawn-deploy";
  return `https://github.com/apps/${appName}/installations/new?state=${userId}`;
}
