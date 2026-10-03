-- Measure the local model adapter separately from the runner-to-cloud heartbeat.
-- This distinguishes a healthy network from a slow or unavailable inference host.
alter table public.agent_runner_status
  add column if not exists adapter_latency_ms int
  check (adapter_latency_ms is null or adapter_latency_ms >= 0);

comment on column public.agent_runner_status.adapter_latency_ms is
  'Authenticated /health round-trip from the runner to the ai-lap adapter.';
