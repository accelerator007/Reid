-- ai-lap connects outward over HTTPS; no Ollama or inbound tunnel is exposed.
create table if not exists public.agent_runner_status (
  id text primary key,
  status text not null default 'offline' check (status in ('online','offline','degraded')),
  version text,
  model text,
  gpu text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_runner_status enable row level security;
drop policy if exists agent_runner_status_admin_read on public.agent_runner_status;
create policy agent_runner_status_admin_read on public.agent_runner_status for select to authenticated
using (public.is_admin());

insert into public.llm_providers (
  id,name,kind,endpoint,chat_model,embedding_model,max_classification,
  enabled,requests_per_hour,requests_per_day,retains_data,notes
) values (
  'ollama','Reid ai-lap','local','outbound://ai-lap','gemma4:12b','nomic-embed-text:latest',
  'restricted',true,120,2000,false,'Outbound HTTPS runner; Gemini remains available as fallback.'
)
on conflict (id) do update set
  name=excluded.name, kind=excluded.kind, endpoint=excluded.endpoint,
  chat_model=excluded.chat_model, embedding_model=excluded.embedding_model,
  max_classification=excluded.max_classification, enabled=true,
  requests_per_hour=excluded.requests_per_hour, requests_per_day=excluded.requests_per_day,
  retains_data=false, notes=excluded.notes;

-- Ollama becomes primary for every governed agent. The Gemini provider remains
-- configured and enabled so an owner can switch any agent back immediately.
update public.agents set provider_id='ollama', updated_at=now();

insert into public.agent_runner_status (id,status,version,model,gpu,last_seen_at)
values ('ai-lap','offline',null,'gemma4:12b','NVIDIA RTX 3080 Ti 12GB',now())
on conflict (id) do nothing;
