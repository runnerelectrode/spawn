-- Run this in Supabase SQL editor after schema.sql

-- Append a single log line to a deployment's logs array
create or replace function append_deploy_log(
  deployment_id uuid,
  message text
)
returns void
language sql
as $$
  update public.deployments
  set logs = array_append(logs, message)
  where id = deployment_id;
$$;
