-- Executable allow/deny suite for the agent gateway.
--
-- The gateway's safety claim is that the database, not the Edge Function,
-- decides where company data may go. These checks run as real `authenticated`
-- and `anon` roles so the policies and the clearance trigger in
-- supabase/migrations decide every outcome. Run with scripts/rls-local.sh.
\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_agents'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id     '11111111-1111-4111-8111-111111111111'
\set admin_id     '22222222-2222-4222-8222-222222222222'
\set employee_id  '33333333-3333-4333-8333-333333333333'
\set hr_id        '66666666-6666-4666-8666-666666666666'
\set run_public   'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
\set run_l3       'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'

insert into auth.users(id, email) values
  (:'owner_id', 'owner@reid.test'), (:'admin_id', 'admin@reid.test'),
  (:'employee_id', 'employee@reid.test'), (:'hr_id', 'hr@reid.test');

update public.profiles set linkedin_url = 'https://linkedin.com/in/reid-test';

insert into public.user_roles(user_id, role) values
  (:'owner_id', 'owner'), (:'admin_id', 'admin'),
  (:'employee_id', 'employee'), (:'hr_id', 'hr');

-- ---------------------------------------------------------------- seeded state
select t_true(:'suite', 'the Owner-approved Gemini runtime accepts all classifications',
  $q$select max_classification = 'restricted' and kind = 'external' and enabled
     from public.llm_providers where id = 'gemini'$q$, true);
select t_true(:'suite', 'the local provider ships disabled',
  $q$select not enabled and kind = 'local' from public.llm_providers where id = 'ollama'$q$, true);
select t_true(:'suite', 'a public agent is enabled on the free tier',
  $q$select enabled and status = 'idle' from public.agents where id = 'marketing'$q$, true);
select t_true(:'suite', 'Operations is enabled on the temporary Gemini runtime',
  $q$select enabled and status = 'idle' and provider_id = 'gemini' from public.agents where id = 'operations'$q$, true);
select t_true(:'suite', 'HR keeps restricted classification while using Gemini',
  $q$select enabled and classification = 'restricted' and provider_id = 'gemini' from public.agents where id = 'hr'$q$, true);
select t_true(:'suite', 'each agent mirrors its provider model',
  $q$select a.model = p.chat_model and a.host = p.id
     from public.agents a join public.llm_providers p on p.id = a.provider_id where a.id = 'marketing'$q$, true);

-- --------------------------------------------------------- clearance enforcement
-- The whole safety story: the trigger refuses the write, so a compromised
-- gateway still cannot route restricted data to an external provider.
select t_allowed(:'suite', 'Owner-approved Gemini accepts a restricted HR run',
  format($$insert into public.agent_runs(agent_id, provider_id, classification, requested_by, status, run_state)
           values ('hr', 'gemini', 'restricted', %L, 'queued', 'queued')$$, :'owner_id'));
select t_allowed(:'suite', 'Owner-approved Gemini accepts internal Operations data',
  format($$insert into public.agent_runs(agent_id, provider_id, classification, requested_by, status, run_state)
           values ('operations', 'gemini', 'internal', %L, 'queued', 'queued')$$, :'owner_id'));
select t_rejected(:'suite', 'a disabled provider is refused even within its ceiling',
  format($$insert into public.agent_runs(agent_id, provider_id, classification, requested_by, status, run_state)
           values ('hr', 'ollama', 'restricted', %L, 'queued', 'queued')$$, :'owner_id'), 'P0001');
select t_allowed(:'suite', 'public data is accepted against the external provider',
  format($$insert into public.agent_runs(id, agent_id, provider_id, classification, requested_by, status, run_state)
           values (%L, 'marketing', 'gemini', 'public', %L, 'succeeded', 'succeeded')$$, :'run_public', :'admin_id'));

insert into public.agent_runs(id, agent_id, provider_id, classification, requested_by, status, run_state, approval_level, approval_state)
values (:'run_l3', 'marketing', 'gemini', 'public', :'employee_id', 'pending_approval', 'pending_approval', 3, 'pending');
insert into public.agent_run_payloads(run_id, action, input) values (:'run_l3', 'run', 'private pending payload');

-- ------------------------------------------------------------------ read access
select test_sign_in(:'employee_id');
select t_visible(:'suite', 'an employee cannot read the agent roster',
  'select 1 from public.agents', 0);
select t_visible(:'suite', 'an employee cannot read the provider registry',
  'select 1 from public.llm_providers', 0);
select t_visible(:'suite', 'an employee sees only their own runs',
  'select 1 from public.agent_runs', 1);
select t_visible(:'suite', 'an employee cannot read their own transient payload',
  'select 1 from public.agent_run_payloads', 0);

select test_sign_in(:'admin_id');
select t_visible(:'suite', 'an admin reads the whole agent roster',
  'select 1 from public.agents', 11);
select t_visible(:'suite', 'an admin reads the whole run stream',
  'select 1 from public.agent_runs', 4);
select t_visible(:'suite', 'an admin cannot read transient payloads',
  'select 1 from public.agent_run_payloads', 0);

select test_sign_out();
select t_visible(:'suite', 'an anonymous visitor sees no agents',
  'select 1 from public.agents', 0);
select t_visible(:'suite', 'an anonymous visitor sees no runs',
  'select 1 from public.agent_runs', 0);
select t_visible(:'suite', 'an anonymous visitor sees no transient payloads',
  'select 1 from public.agent_run_payloads', 0);

-- ----------------------------------------------------------------- agent control
select test_sign_in(:'admin_id');
select t_changed(:'suite', 'an admin can pause an agent',
  $q$update public.agents set status = 'paused' where id = 'marketing'$q$, 1);
select t_changed(:'suite', 'an admin cannot enable a provider',
  $q$update public.llm_providers set enabled = true where id = 'ollama'$q$, 0);

select test_sign_in(:'employee_id');
select t_changed(:'suite', 'an employee cannot pause an agent',
  $q$update public.agents set status = 'paused' where id = 'content'$q$, 0);

select test_sign_in(:'owner_id');
select t_changed(:'suite', 'the Owner can lower a provider ceiling',
  $q$update public.llm_providers set max_classification = 'internal' where id = 'gemini'$q$, 1);
select t_changed(:'suite', 'the Owner can restore the approved restricted ceiling',
  $q$update public.llm_providers set max_classification = 'restricted' where id = 'gemini'$q$, 1);

-- ---------------------------------------------------------------- approval engine
select test_sign_in(:'employee_id');
select t_rejected(:'suite', 'an employee cannot approve their own L3 run',
  format('select public.approve_agent_run(%L, %L)', :'run_l3', 'approved'), 'P0001');

select test_sign_in(:'hr_id');
select t_visible(:'suite', 'an L3 approver sees the run waiting on them',
  $q$select 1 from public.agent_runs where approval_state = 'pending'$q$, 1);
select t_allowed(:'suite', 'HR can approve an L3 run',
  format('select public.approve_agent_run(%L, %L)', :'run_l3', 'approved'));
select t_true(:'suite', 'approval queues the run and records the approver',
  format($$select run_state = 'queued' and approval_state = 'approved' and approved_by = %L
           from public.agent_runs where id = %L$$, :'hr_id', :'run_l3'), true);
select t_rejected(:'suite', 'an already decided run cannot be approved twice',
  format('select public.approve_agent_run(%L, %L)', :'run_l3', 'rejected'), 'P0001');

-- ------------------------------------------------------------------------ audit
select test_sign_out();
set local role postgres;
select t_visible(:'suite', 'provider changes are written to the audit log',
  $q$select 1 from public.audit_logs where table_name = 'llm_providers'$q$, null);
select t_visible(:'suite', 'agent runs publish to Realtime',
  $q$select 1 from pg_publication_tables where pubname = 'supabase_realtime'
     and schemaname = 'public' and tablename = 'agent_runs'$q$, 1);
select t_true(:'suite', 'a run keeps only a prompt hash, never the prompt',
  $q$select count(*) = 0 from information_schema.columns
     where table_schema = 'public' and table_name = 'agent_runs' and column_name = 'prompt'$q$, true);

\o
select label, case when ok then 'PASS' else 'FAIL' end as result, detail
from public.test_results where suite = :'suite' order by id;
select t_finish(:'suite');
rollback;
