-- Retain an approved run's payload privately until a human decision is made.
-- The table has RLS with no client policies: only the gateway's service-role
-- client can read it. It is deleted immediately after execution/rejection.

create table public.agent_run_payloads (
  run_id uuid primary key references public.agent_runs(id) on delete cascade,
  action text not null default 'run' check (action in ('run', 'embed')),
  input text not null check (length(btrim(input)) > 0 and length(input) <= 20000),
  created_at timestamptz not null default now()
);

alter table public.agent_run_payloads enable row level security;
revoke all on public.agent_run_payloads from anon, authenticated;

comment on table public.agent_run_payloads is
  'Private transient payloads for L2-L4 agent runs. Service role only; rows are removed after approval, rejection, or execution.';
