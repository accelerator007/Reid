-- Live ai-lap telemetry for the Owner command center. No secrets, prompts, or
-- document contents are stored here.
alter table public.agent_runner_status
  add column if not exists ping_ms int,
  add column if not exists cpu_percent numeric(5,2),
  add column if not exists memory_used_gb numeric(6,2),
  add column if not exists memory_total_gb numeric(6,2),
  add column if not exists gpu_utilization int,
  add column if not exists vram_used_mb int,
  add column if not exists vram_total_mb int;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_runner_status')
  then alter publication supabase_realtime add table public.agent_runner_status; end if;
end $$;
