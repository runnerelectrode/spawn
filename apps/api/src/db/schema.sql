-- Run this in your Supabase SQL editor to set up the schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (mirrors Supabase auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  github_username text,
  github_installation_id bigint,
  notify_email boolean default true,
  notify_webhook_url text,
  created_at timestamptz default now()
);

-- Apps (each deployed repository)
create table if not exists public.apps (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  repo_url text not null,
  repo_full_name text not null,            -- "owner/repo"
  fly_app_name text unique,
  fly_machine_id text,
  status text not null default 'pending',  -- see AppStatus type
  url text,
  framework text not null default 'unknown',
  ram_mb integer not null default 512,
  cpu_count integer not null default 1,
  region text not null default 'iad',
  env_vars jsonb not null default '{}',
  auto_deploy boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Deployments (each deploy attempt)
create table if not exists public.deployments (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references public.apps(id) on delete cascade,
  commit_sha text not null,
  commit_message text,
  status text not null default 'queued',   -- queued | running | success | failed
  logs text[] not null default '{}',
  dockerfile text,
  analysis jsonb,
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Health check log
create table if not exists public.health_checks (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references public.apps(id) on delete cascade,
  status text not null,                    -- healthy | degraded | down
  response_ms integer,
  memory_mb integer,
  memory_pct integer,
  checked_at timestamptz default now()
);

-- Heal events (audit log of self-healing actions)
create table if not exists public.heal_events (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references public.apps(id) on delete cascade,
  action text not null,                    -- restart | scale_memory | redeploy_with_fix
  reason text not null,
  fix_description text,
  new_ram_mb integer,
  triggered_at timestamptz default now()
);

-- Indexes
create index if not exists apps_user_id_idx on public.apps(user_id);
create index if not exists deployments_app_id_idx on public.deployments(app_id);
create index if not exists health_checks_app_id_idx on public.health_checks(app_id);

-- Auto-update updated_at on apps
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger apps_updated_at
  before update on public.apps
  for each row execute function update_updated_at();

-- RLS: users can only see their own data
alter table public.apps enable row level security;
alter table public.deployments enable row level security;
alter table public.health_checks enable row level security;
alter table public.heal_events enable row level security;

create policy "users see own apps" on public.apps
  for all using (auth.uid() = user_id);

create policy "users see own deployments" on public.deployments
  for all using (
    app_id in (select id from public.apps where user_id = auth.uid())
  );

create policy "users see own health_checks" on public.health_checks
  for all using (
    app_id in (select id from public.apps where user_id = auth.uid())
  );

create policy "users see own heal_events" on public.heal_events
  for all using (
    app_id in (select id from public.apps where user_id = auth.uid())
  );
