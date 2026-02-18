import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, Framework } from "@spawn/shared";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RepoSnapshot {
  fileTree: string;          // output of `find . -type f | head -100`
  packageJson?: string;
  dockerfile?: string;
  requirements?: string;
  goMod?: string;
  cargoToml?: string;
  gemfile?: string;
  composerJson?: string;
  mainEntry?: string;        // content of main entry file if found
}

const SYSTEM_PROMPT = `You are a senior DevOps engineer and deployment specialist.
Your job is to analyze a GitHub repository and produce an exact, production-ready deployment configuration.

RULES:
- Be specific about RAM. Don't guess 512MB if the framework clearly needs more.
  - Next.js SSR: minimum 512MB, recommend 1024MB
  - FastAPI/Flask: minimum 256MB
  - Django: minimum 512MB
  - Rails: minimum 512MB, recommend 1024MB
  - Node/Express: minimum 256MB
  - Apps with AI/ML imports (torch, tensorflow, transformers): minimum 2048MB
- Always expose port via ENV PORT with a fallback (e.g., process.env.PORT || 3000)
- Always add a /health endpoint check — if the app doesn't have one, note it as a blocker
- Generate multi-stage Dockerfiles when there's a build step
- NEVER hardcode secrets — list them as env_vars_needed
- If you see .env.example or .env.sample, extract all variables from it
- Output ONLY valid JSON, no markdown fences, no commentary`;

const ANALYSIS_PROMPT = (snapshot: RepoSnapshot) => `
Analyze this repository and return a deployment configuration as JSON.

FILE TREE:
${snapshot.fileTree}

${snapshot.packageJson ? `PACKAGE.JSON:\n${snapshot.packageJson}` : ""}
${snapshot.requirements ? `REQUIREMENTS.TXT:\n${snapshot.requirements}` : ""}
${snapshot.goMod ? `GO.MOD:\n${snapshot.goMod}` : ""}
${snapshot.cargoToml ? `CARGO.TOML:\n${snapshot.cargoToml}` : ""}
${snapshot.gemfile ? `GEMFILE:\n${snapshot.gemfile}` : ""}
${snapshot.composerJson ? `COMPOSER.JSON:\n${snapshot.composerJson}` : ""}
${snapshot.dockerfile ? `EXISTING DOCKERFILE:\n${snapshot.dockerfile}` : ""}
${snapshot.mainEntry ? `MAIN ENTRY FILE:\n${snapshot.mainEntry}` : ""}

Return this exact JSON schema (no extra fields, no markdown):
{
  "framework": "nextjs|react|express|fastapi|django|rails|laravel|go|rust|static|unknown",
  "runtime": "node|python|ruby|go|rust|php|static",
  "version": "20" (runtime major version),
  "ram_mb": 512,
  "cpu_count": 1,
  "port": 3000,
  "has_health_endpoint": false,
  "health_endpoint": "/health",
  "env_vars_needed": [
    { "name": "DATABASE_URL", "description": "PostgreSQL connection string", "required": true }
  ],
  "blockers": ["No /health endpoint found — add GET /health returning 200"],
  "dockerfile": "FROM node:20-alpine AS base\\n...",
  "start_command": "node server.js",
  "build_command": "npm run build",
  "summary": "Next.js 14 app with App Router. Needs 1GB RAM for SSR. Missing /health endpoint."
}`;

const CRASH_HEAL_PROMPT = (
  snapshot: RepoSnapshot,
  crashLogs: string,
  currentDockerfile: string,
  currentRamMb: number
) => `
A deployed app has crashed 3 times. Diagnose and provide a fix.

CRASH LOGS (last 200 lines):
${crashLogs.slice(-8000)}

CURRENT DOCKERFILE:
${currentDockerfile}

CURRENT RAM: ${currentRamMb}MB

FILE TREE:
${snapshot.fileTree}

${snapshot.packageJson ? `PACKAGE.JSON:\n${snapshot.packageJson}` : ""}

Return this exact JSON (no markdown):
{
  "type": "restart|scale_memory|redeploy_with_fix|notify_only",
  "reason": "OOM kill detected in logs",
  "fix_description": "Scaled memory from 512MB to 1024MB",
  "dockerfile_patch": null,
  "new_ram_mb": 1024
}

Rules:
- If logs show "Killed" or "OOM" or "Cannot allocate memory": type=scale_memory, double the RAM
- If logs show a code error (syntax, missing module, env var): type=redeploy_with_fix, provide dockerfile_patch
- If logs show a transient error (network timeout, db connection): type=restart
- If you cannot determine the cause: type=notify_only`;

export async function analyzeRepo(snapshot: RepoSnapshot): Promise<AnalysisResult> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: ANALYSIS_PROMPT(snapshot) }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  try {
    return JSON.parse(content.text) as AnalysisResult;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${content.text.slice(0, 200)}`);
  }
}

export async function diagnoseCrash(
  snapshot: RepoSnapshot,
  crashLogs: string,
  currentDockerfile: string,
  currentRamMb: number
) {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: CRASH_HEAL_PROMPT(snapshot, crashLogs, currentDockerfile, currentRamMb),
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  try {
    return JSON.parse(content.text);
  } catch {
    return {
      type: "notify_only",
      reason: "Claude could not parse crash logs",
      fix_description: null,
      dockerfile_patch: null,
      new_ram_mb: null,
    };
  }
}

export type { RepoSnapshot };
