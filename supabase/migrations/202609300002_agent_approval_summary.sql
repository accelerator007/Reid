-- Give approvers enough information to make a real decision without exposing
-- the private transient payload that is kept service-role-only.
alter table public.agent_runs
  add column if not exists requested_tool text references public.agent_tools(id) on delete set null,
  add column if not exists request_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_summary) = 'object');

comment on column public.agent_runs.requested_tool is
  'Governed tool requested by this run; visible to authorized approvers.';
comment on column public.agent_runs.request_summary is
  'Bounded and redacted argument summary for a human approval decision. Never stores credentials or the full prompt.';
