/**
 * Fly.io Machines API wrapper.
 * Docs: https://fly.io/docs/machines/api/
 */

const FLY_API_BASE = "https://api.machines.dev/v1";
const FLY_GRAPHQL = "https://api.fly.io/graphql";

function headers() {
  return {
    Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function flyFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${FLY_API_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fly API error ${res.status} on ${path}: ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

export async function createFlyApp(appName: string): Promise<void> {
  await flyFetch(`/apps`, {
    method: "POST",
    body: JSON.stringify({
      app_name: appName,
      org_slug: process.env.FLY_ORG_SLUG ?? "personal",
    }),
  });
}

export async function deleteFlyApp(appName: string): Promise<void> {
  await flyFetch(`/apps/${appName}`, { method: "DELETE" });
}

// ─── Machine lifecycle ─────────────────────────────────────────────────────

export interface MachineConfig {
  appName: string;
  imageRef: string;         // e.g. "registry.fly.io/my-app:latest"
  region: string;           // e.g. "iad"
  ramMb: number;
  cpuCount: number;
  port: number;
  envVars: Record<string, string>;
  healthEndpoint: string;   // e.g. "/health"
}

export async function deployMachine(config: MachineConfig): Promise<string> {
  const body = {
    region: config.region,
    config: {
      image: config.imageRef,
      env: config.envVars,
      services: [
        {
          ports: [
            { port: 443, handlers: ["tls", "http"] },
            { port: 80, handlers: ["http"] },
          ],
          protocol: "tcp",
          internal_port: config.port,
          checks: [
            {
              type: "http",
              interval: "15s",
              timeout: "5s",
              grace_period: "30s",
              method: "GET",
              path: config.healthEndpoint,
              port: config.port,
            },
          ],
        },
      ],
      guest: {
        cpu_kind: "shared",
        cpus: config.cpuCount,
        memory_mb: config.ramMb,
      },
      restart: { policy: "on-failure", max_retries: 3 },
    },
  };

  const res: any = await flyFetch(`/apps/${config.appName}/machines`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return res.id as string;
}

export async function destroyMachine(appName: string, machineId: string): Promise<void> {
  // Force stop first
  await flyFetch(`/apps/${appName}/machines/${machineId}/stop`, { method: "POST" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  await flyFetch(`/apps/${appName}/machines/${machineId}`, {
    method: "DELETE",
    body: JSON.stringify({ force: true }),
  });
}

export async function restartMachine(appName: string, machineId: string): Promise<void> {
  await flyFetch(`/apps/${appName}/machines/${machineId}/restart`, { method: "POST" });
}

export async function scaleMachineMemory(
  appName: string,
  machineId: string,
  newRamMb: number
): Promise<void> {
  await flyFetch(`/apps/${appName}/machines/${machineId}`, {
    method: "PATCH",
    body: JSON.stringify({
      config: { guest: { memory_mb: newRamMb } },
    }),
  });
}

export async function getMachineStatus(
  appName: string,
  machineId: string
): Promise<{ state: string; instance_id: string }> {
  return flyFetch(`/apps/${appName}/machines/${machineId}`) as any;
}

export async function getMachineLogs(
  appName: string,
  machineId: string,
  lines = 200
): Promise<string> {
  // Fly logs API via GraphQL (REST logs endpoint is streaming only)
  const query = `
    query($appName: String!, $machineId: String!, $lines: Int!) {
      app(name: $appName) {
        logs(machineId: $machineId, limit: $lines) {
          timestamp
          level
          message
        }
      }
    }
  `;

  const res = await fetch(FLY_GRAPHQL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables: { appName, machineId, lines } }),
  });

  const data: any = await res.json();
  const logs: Array<{ timestamp: string; message: string }> =
    data?.data?.app?.logs ?? [];

  return logs.map((l) => `[${l.timestamp}] ${l.message}`).join("\n");
}

// ─── Registry / Image build ────────────────────────────────────────────────

/**
 * Build a Docker image using Fly's remote builder and push to Fly registry.
 * Uses flyctl under the hood — flyctl must be installed in the API container.
 */
export async function buildAndPushImage(
  appName: string,
  repoPath: string,
  dockerfilePath: string
): Promise<string> {
  const { execa } = await import("execa" as any);
  const imageRef = `registry.fly.io/${appName}:latest`;

  await execa(
    "flyctl",
    [
      "deploy",
      "--build-only",
      "--push",
      "--dockerfile", dockerfilePath,
      "--app", appName,
      "--remote-only",
    ],
    { cwd: repoPath, stdout: "pipe", stderr: "pipe" }
  );

  return imageRef;
}

// ─── App URL ──────────────────────────────────────────────────────────────

export function getAppUrl(appName: string): string {
  return `https://${appName}.fly.dev`;
}
