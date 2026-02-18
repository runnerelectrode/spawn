# Spawn — One-Click AI Deploy Platform

Push code. Claude configures it. Spawn deploys it. The self-healer fixes it.

## Architecture

```
GitHub Push → Webhook → Deploy Queue (BullMQ)
                              ↓
                    Claude Opus 4.6 Analysis
                    (Dockerfile + RAM + config)
                              ↓
                    Fly.io Machines API deploy
                              ↓
                    Health Monitor (every 30s)
                    → Auto-restart → Scale → Claude heal
                              ↓
                    Email / Webhook notification
```

## Setup

### 1. Prerequisites
- [Bun](https://bun.sh) installed
- [Fly.io account](https://fly.io) + `flyctl` installed and authenticated
- [Supabase project](https://supabase.com)
- [GitHub App](https://github.com/settings/apps/new) created
- Redis (local: `brew install redis && brew services start redis`)

### 2. GitHub App settings
- **Permissions:** Contents (read), Metadata (read)
- **Subscribe to events:** Push
- **Callback URL:** `http://localhost:3001/github/callback`
- **Webhook URL:** `http://localhost:3001/github/webhook` (use [ngrok](https://ngrok.com) for local dev)

### 3. Supabase
1. Create a new project
2. Run `apps/api/src/db/schema.sql` in the SQL editor
3. Run `apps/api/src/db/functions.sql` in the SQL editor
4. Enable GitHub OAuth in Authentication → Providers

### 4. Environment variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Fill in all values
```

### 5. Install & run
```bash
bun install
bun run dev          # starts both API (3001) and web (3000)
bun run worker       # start deploy worker + health checker in separate terminal
```

## Key files

| File | Purpose |
|---|---|
| `apps/api/src/agents/analyzer.ts` | Claude Opus 4.6 — analyzes repo, generates Dockerfile |
| `apps/api/src/agents/analyzer.ts` (diagnoseCrash) | Claude diagnoses crashes, returns fix |
| `apps/api/src/workers/deploy.ts` | Full deploy pipeline (clone → analyze → build → deploy) |
| `apps/api/src/workers/healer.ts` | Self-healing loop (health checks + auto-scale + Claude) |
| `apps/api/src/services/fly.ts` | Fly.io Machines API wrapper |
| `apps/web/app/deploy/page.tsx` | One-click deploy UI |
| `apps/web/app/dashboard/page.tsx` | App dashboard |

## Self-healing logic

```
Health check fails
  → 1st/2nd failure: restart machine
  → 3rd+ failure: send crash logs to Claude Opus 4.6
      → OOM detected? scale_memory (double RAM)
      → Code error? redeploy_with_fix (patch Dockerfile)
      → Transient? restart
      → Unknown? notify_only (email user)
Memory > 85%? → scale_memory proactively (1.5x RAM)
```
