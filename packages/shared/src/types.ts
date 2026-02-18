export type AppStatus =
  | "pending"
  | "analyzing"
  | "building"
  | "deploying"
  | "running"
  | "crashed"
  | "healing"
  | "stopped";

export type Framework =
  | "nextjs"
  | "react"
  | "express"
  | "fastapi"
  | "django"
  | "rails"
  | "laravel"
  | "go"
  | "rust"
  | "static"
  | "unknown";

export interface SpawnApp {
  id: string;
  user_id: string;
  name: string;
  repo_url: string;
  repo_full_name: string; // "owner/repo"
  fly_app_name: string;
  fly_machine_id: string | null;
  status: AppStatus;
  url: string | null;
  framework: Framework;
  ram_mb: number;
  cpu_count: number;
  region: string;
  env_vars: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  app_id: string;
  commit_sha: string;
  commit_message: string;
  status: "queued" | "running" | "success" | "failed";
  logs: string[];
  started_at: string;
  finished_at: string | null;
  error: string | null;
  dockerfile: string | null;
  analysis: AnalysisResult | null;
}

export interface AnalysisResult {
  framework: Framework;
  runtime: string;
  version: string;
  ram_mb: number;
  cpu_count: number;
  port: number;
  has_health_endpoint: boolean;
  health_endpoint: string;
  env_vars_needed: Array<{ name: string; description: string; required: boolean }>;
  blockers: string[];
  dockerfile: string;
  start_command: string;
  build_command: string | null;
  summary: string;
}

export interface HealAction {
  type: "restart" | "scale_memory" | "redeploy_with_fix" | "notify_only";
  reason: string;
  fix_description: string | null;
  dockerfile_patch: string | null;
  new_ram_mb: number | null;
}

export interface DeployJobPayload {
  app_id: string;
  deployment_id: string;
  repo_url: string;
  repo_full_name: string;
  commit_sha: string;
  installation_id: number;
}

export interface HealthCheckResult {
  app_id: string;
  status: "healthy" | "degraded" | "down";
  response_ms: number | null;
  memory_mb: number | null;
  memory_pct: number | null;
  checked_at: string;
}
