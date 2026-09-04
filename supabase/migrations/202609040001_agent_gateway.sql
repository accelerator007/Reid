-- Phase 3 step 2: the private agent gateway.
-- Agents stop being a visual mock and become queued, authorized, audited runs.
--
-- Two rules are enforced in the database, not only in the Edge Function, so a
-- bug or a future caller cannot route company data to the wrong place:
--   1. A provider carries a trust kind. `external` providers (Gemini) leave
--      company control; `local` providers (Ollama on ai-lap) do not.
--   2. Every run declares a data classification. A provider may only handle
--      classifications at or below its own ceiling, so HR/CV and finance data
--      can never reach an external provider while ai-lap is offline.

create type public.data_class as enum ('public', 'internal', 'confidential', 'restricted');
create type public.provider_kind as enum ('external', 'local');
create type public.run_status as enum ('pending_approval', 'queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.approval_status as enum ('not_required', 'pending', 'approved', 'rejected');

-- Ordering helper: `public` is the least sensitive, `restricted` the most.
create or replace function public.data_class_rank(value public.data_class)
returns int
language sql
immutable
set search_path = ''
as $$
  select case value
    when 'public' then 0
    when 'internal' then 1
    when 'confidential' then 2
    when 'restricted' then 3
  end
$$;

create table public.llm_providers (
  id text primary key,
  name text not null,
  kind public.provider_kind not null,
  endpoint text not null,
  chat_model text not null,
  embedding_model text,
  -- The highest classification this provider is allowed to receive.
  max_classification public.data_class not null default 'public',
  -- Free Gemini tiers may reuse content for product improvement. Recorded so
  -- the Owner decision is visible in data, not only in documentation.
  retains_data boolean not null default true,
  enabled boolean not null default false,
  requests_per_hour int not null default 60 check (requests_per_hour > 0),
  notes text,
  created_at timestamptz not null default now()
);

-- Gemini is the temporary provider while ai-lap is offline. It is capped at
-- `internal`: the HR, finance and CRM agents below sit above that ceiling and
-- therefore stay unroutable until a local provider is enabled.
insert into public.llm_providers (id, name, kind, endpoint, chat_model, embedding_model, max_classification, retains_data, enabled, requests_per_hour, notes)
values
  ('gemini', 'Google Gemini API', 'external', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash', 'text-embedding-004', 'internal', true, true, 60,
   'Temporary substitute for ai-lap. Confirm the paid tier before raising max_classification above internal.'),
  ('ollama', 'Ollama on ai-lap', 'local', 'http://ai-lap:11434', 'gemma3:12b', 'nomic-embed-text', 'restricted', false, false, 600,
   'Preferred provider. Enable only after the host is online and the installed model name is re-verified.');

alter table public.agents
  add column provider_id text not null default 'gemini' references public.llm_providers,
  -- Highest classification of data this agent is expected to handle.
  add column classification public.data_class not null default 'internal',
  add column system_prompt text,
  add column enabled boolean not null default false,
  add column disabled_reason text,
  add column updated_at timestamptz not null default now();

-- The V1 agent roster, mapped onto the data it actually touches.
update public.agents set classification = 'public' where id in ('marketing', 'content', 'competitor');
update public.agents set classification = 'internal' where id in ('operations', 'analytics', 'knowledge', 'support', 'ceo');
update public.agents set classification = 'confidential' where id in ('sales');
update public.agents set classification = 'restricted' where id in ('hr', 'finance');

-- Only agents whose classification fits inside Gemini's ceiling start enabled.
update public.agents
set enabled = true, status = 'idle'
where public.data_class_rank(classification) <= public.data_class_rank('internal');

update public.agents
set enabled = false,
    status = 'disabled',
    disabled_reason = 'Handles confidential or restricted data; blocked until a local provider is enabled.'
where public.data_class_rank(classification) > public.data_class_rank('internal');

-- `model` and `host` predate the provider registry. Keep them mirroring the
-- resolved provider so the dashboard and pgTAP never read a stale model name.
create or replace function public.sync_agent_provider_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select provider.chat_model, provider.id into new.model, new.host
  from public.llm_providers provider
  where provider.id = new.provider_id;
  return new;
end
$$;

revoke execute on function public.sync_agent_provider_fields() from public, anon, authenticated;

create trigger agents_sync_provider before insert or update of provider_id on public.agents
  for each row execute function public.sync_agent_provider_fields();

update public.agents agent
set model = provider.chat_model, host = provider.id
from public.llm_providers provider
where provider.id = agent.provider_id;

-- A run may never be dispatched to a provider that is not cleared for its data.
create or replace function public.provider_accepts(target_provider text, wanted public.data_class)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.llm_providers provider
    where provider.id = target_provider
      and provider.enabled
      and public.data_class_rank(provider.max_classification) >= public.data_class_rank(wanted)
  )
$$;

revoke all on function public.provider_accepts(text, public.data_class) from public, anon;
grant execute on function public.provider_accepts(text, public.data_class) to authenticated;

alter table public.agent_runs
  add column provider_id text references public.llm_providers,
  add column requested_by uuid references public.profiles,
  add column classification public.data_class not null default 'internal',
  add column approval_level int not null default 0 check (approval_level between 0 and 4),
  add column approval_state public.approval_status not null default 'not_required',
  add column approved_by uuid references public.profiles,
  add column approved_at timestamptz,
  add column run_state public.run_status not null default 'queued',
  -- Prompts are never stored in full: `prompt_hash` stays the correlation key
  -- and only a short redacted preview of the answer is kept for review.
  add column output_preview text,
  add column replay_of uuid references public.agent_runs,
  add column started_at timestamptz,
  add column finished_at timestamptz;

create index agent_runs_recent on public.agent_runs (created_at desc);
create index agent_runs_requester on public.agent_runs (requested_by, created_at desc);
create index agent_runs_pending_approval on public.agent_runs (approval_state) where approval_state = 'pending';

-- Hard stop at the storage layer: even a compromised gateway cannot write a run
-- that points a restricted agent at an external provider. A trigger is used
-- rather than a check constraint so the rule is re-evaluated against the
-- provider's current clearance on every write.
create or replace function public.enforce_run_clearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_id is not null and not public.provider_accepts(new.provider_id, new.classification) then
    raise exception 'provider_not_cleared_for_classification: % cannot handle %', new.provider_id, new.classification;
  end if;
  return new;
end
$$;

revoke execute on function public.enforce_run_clearance() from public, anon, authenticated;

create trigger agent_runs_clearance before insert or update on public.agent_runs
  for each row execute function public.enforce_run_clearance();

alter table public.llm_providers enable row level security;
create trigger audit_llm_providers after insert or update or delete on public.llm_providers
  for each row execute function public.audit_row();

create policy providers_admin_read on public.llm_providers for select to authenticated
using (public.is_admin());

-- Enabling a provider decides where company data goes, so it is Owner-only.
create policy providers_owner_write on public.llm_providers for all to authenticated
using (public.has_role('owner') or public.has_role('super_admin'))
with check (public.has_role('owner') or public.has_role('super_admin'));

-- Pause, disable and manual-run controls for the agent roster.
drop policy if exists agents_admin on public.agents;
create policy agents_admin_read on public.agents for select to authenticated
using (public.is_admin());
create policy agents_admin_write on public.agents for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Requesters see their own runs; admins see the whole stream.
drop policy if exists runs_admin on public.agent_runs;
create policy runs_scope_read on public.agent_runs for select to authenticated
using (public.is_admin() or requested_by = auth.uid());

-- Approvals are recorded through the RPC below, never by direct table writes.
create or replace function public.approve_agent_run(run_id uuid, decision public.approval_status, note text default null)
returns public.agent_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.agent_runs;
  approver_roles public.app_role[];
begin
  if decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  select * into target from public.agent_runs where id = run_id for update;
  if not found then
    raise exception 'run_not_found';
  end if;
  if target.approval_state <> 'pending' then
    raise exception 'run_not_pending';
  end if;

  select array_agg(role) into approver_roles from public.user_roles where user_id = auth.uid();

  -- Mirrors canApprove() in src/policy.ts: L2 admin, L3 admin or HR, L4 Owner.
  if target.approval_level = 4 and not ('owner' = any(approver_roles)) then
    raise exception 'owner_approval_required';
  elsif target.approval_level = 3 and not (approver_roles && array['owner','super_admin','admin','hr']::public.app_role[]) then
    raise exception 'approval_denied';
  elsif target.approval_level = 2 and not (approver_roles && array['owner','super_admin','admin']::public.app_role[]) then
    raise exception 'approval_denied';
  end if;

  update public.agent_runs
  set approval_state = decision,
      approved_by = auth.uid(),
      approved_at = now(),
      run_state = case when decision = 'approved' then 'queued'::public.run_status else 'cancelled'::public.run_status end,
      error = case when decision = 'rejected' then coalesce(note, 'rejected_by_approver') else error end
  where id = run_id
  returning * into target;

  return target;
end
$$;

revoke all on function public.approve_agent_run(uuid, public.approval_status, text) from public, anon;
grant execute on function public.approve_agent_run(uuid, public.approval_status, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_runs'
  ) then alter publication supabase_realtime add table public.agent_runs; end if;
end$$;
