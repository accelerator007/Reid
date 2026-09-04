-- Executable RLS allow/deny suite for the Research workspace.
--
-- Every check runs as a real `authenticated` (or `anon`) Postgres role with a
-- JWT claim, so the policies in supabase/migrations decide the outcome — not
-- the React UI. Run with scripts/rls-local.sh.
\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_research'

begin;
set local search_path = public;
-- Each check records its own row; only the summary table below is printed.
set local client_min_messages = warning;
\o /dev/null

-- Fixed identifiers so JWT claims can be written literally below.
\set owner_id     '11111111-1111-4111-8111-111111111111'
\set super_id     '22222222-2222-4222-8222-222222222222'
\set member_id    '33333333-3333-4333-8333-333333333333'
\set outsider_id  '44444444-4444-4444-8444-444444444444'
\set suspended_id '55555555-5555-4555-8555-555555555555'
\set hr_id        '66666666-6666-4666-8666-666666666666'
\set research_a   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set research_b   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set doc_open     'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

insert into auth.users(id, email) values
  (:'owner_id', 'owner@reid.test'), (:'super_id', 'supervisor@reid.test'),
  (:'member_id', 'member@reid.test'), (:'outsider_id', 'outsider@reid.test'),
  (:'suspended_id', 'suspended@reid.test'), (:'hr_id', 'hr@reid.test');

update public.profiles set linkedin_url = 'https://linkedin.com/in/reid-test';

insert into public.user_roles(user_id, role) values
  (:'owner_id', 'owner'), (:'super_id', 'employee'), (:'member_id', 'employee'),
  (:'outsider_id', 'employee'), (:'suspended_id', 'employee'), (:'hr_id', 'hr');

update public.account_controls set status = 'suspended' where user_id = :'suspended_id';

insert into public.research(id, title, abstract, status, supervisor_id, is_public, created_by, field)
values
  (:'research_a', 'Private Reid study', 'Private', 'active', :'super_id', false, :'owner_id', 'AI'),
  -- A second study the supervisor does NOT run, so cross-research denial is real.
  (:'research_b', 'Public Reid study', 'Public', 'active', :'owner_id', true, :'owner_id', 'AI');

insert into public.research_members(research_id, user_id, member_role) values
  (:'research_a', :'super_id', 'supervisor'),
  (:'research_a', :'member_id', 'researcher'),
  (:'research_a', :'suspended_id', 'researcher');

insert into public.research_datasets(id, research_id, name, sensitivity, created_by)
values (gen_random_uuid(), :'research_a', 'Seed dataset', 'internal', :'super_id');

insert into public.research_documents(id, research_id, title, storage_path, restricted, uploaded_by) values
  (:'doc_open', :'research_a', 'Open protocol', :'research_a' || '/open.pdf', false, :'super_id'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', :'research_a', 'Restricted ethics file', :'research_a' || '/restricted.pdf', true, :'super_id');

insert into public.research_publications(research_id, title, status, venue_type, created_by) values
  (:'research_b', 'Published Reid paper', 'published', 'journal', :'super_id'),
  (:'research_b', 'Unpublished Reid draft', 'draft', 'journal', :'super_id');

insert into storage.objects(bucket_id, name) values ('research-files', :'research_a' || '/open.pdf');

delete from public.test_results where suite = :'suite';

-- ── anonymous ───────────────────────────────────────────────────────────────
set local role anon;
select t_visible(:'suite', 'anon sees no research at all', 'select 1 from public.research', 0);
select t_visible(:'suite', 'anon sees no research members', 'select 1 from public.research_members', 0);
select t_visible(:'suite', 'anon sees no research documents', 'select 1 from public.research_documents', 0);
select t_rejected(:'suite', 'anon cannot create research',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, %L, %L)', 'Anon study', :'super_id', :'super_id'));
reset role;

-- ── outsider: an active employee with no membership ─────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select t_visible(:'suite', 'outsider sees only the public research', 'select 1 from public.research', 1);
select t_visible(:'suite', 'outsider sees no members of the private research', 'select 1 from public.research_members', 0);
select t_visible(:'suite', 'outsider sees no datasets', 'select 1 from public.research_datasets', 0);
select t_visible(:'suite', 'outsider sees no documents', 'select 1 from public.research_documents', 0);
select t_visible(:'suite', 'outsider sees no activity', 'select 1 from public.research_activity', 0);
select t_visible(:'suite', 'outsider sees only published papers of public research', 'select 1 from public.research_publications', 1);
select t_changed(:'suite', 'outsider update of research changes nothing',
  format('update public.research set title = %L where id = %L', 'Hijacked', :'research_a'), 0);
select t_rejected(:'suite', 'outsider cannot create research',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, %L, %L)', 'Outsider study', :'outsider_id', :'outsider_id'));
select t_rejected(:'suite', 'outsider cannot log an experiment',
  format('insert into public.research_experiments(research_id, title, created_by) values (%L, %L, %L)', :'research_a', 'Outsider run', :'outsider_id'));
select t_rejected(:'suite', 'outsider cannot upload to the research bucket',
  format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'research-files', :'research_a' || '/outsider.pdf'));
select t_visible(:'suite', 'outsider sees no research storage objects', 'select 1 from storage.objects', 0);
reset role;

-- ── suspended member: membership exists but the account is not active ───────
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select t_visible(:'suite', 'suspended member loses private research access', 'select 1 from public.research', 1);
select t_visible(:'suite', 'suspended member loses dataset access', 'select 1 from public.research_datasets', 0);
select t_rejected(:'suite', 'suspended member cannot log an experiment',
  format('insert into public.research_experiments(research_id, title, created_by) values (%L, %L, %L)', :'research_a', 'Suspended run', :'suspended_id'));
reset role;

-- ── ordinary researcher ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select t_visible(:'suite', 'member sees the private and the public research', 'select 1 from public.research', 2);
select t_visible(:'suite', 'member sees the research team', 'select 1 from public.research_members', 3);
select t_visible(:'suite', 'member sees the datasets', 'select 1 from public.research_datasets', 1);
select t_visible(:'suite', 'member sees document metadata for both files', 'select 1 from public.research_documents', 2);
select t_changed(:'suite', 'member cannot rename the research',
  format('update public.research set title = %L where id = %L', 'Member rename', :'research_a'), 0);
select t_rejected(:'suite', 'member cannot add a teammate',
  format('insert into public.research_members(research_id, user_id) values (%L, %L)', :'research_a', :'outsider_id'));
select t_rejected(:'suite', 'member cannot register a dataset',
  format('insert into public.research_datasets(research_id, name, created_by) values (%L, %L, %L)', :'research_a', 'Member dataset', :'member_id'));
select t_rejected(:'suite', 'member cannot file an ethics approval',
  format('insert into public.research_ethics_approvals(research_id, title, authority, created_by) values (%L, %L, %L, %L)', :'research_a', 'Member ethics', 'IRB', :'member_id'));
select t_rejected(:'suite', 'member cannot record a publication',
  format('insert into public.research_publications(research_id, title, created_by) values (%L, %L, %L)', :'research_a', 'Member paper', :'member_id'));
select t_allowed(:'suite', 'member can log their own experiment',
  format('insert into public.research_experiments(id, research_id, title, created_by) values (%L, %L, %L, %L)', 'e1111111-1111-4111-8111-111111111111', :'research_a', 'Member run', :'member_id'));
select t_rejected(:'suite', 'member cannot log an experiment under another author',
  format('insert into public.research_experiments(research_id, title, created_by) values (%L, %L, %L)', :'research_a', 'Forged run', :'super_id'));
select t_changed(:'suite', 'member can update their own experiment',
  format('update public.research_experiments set status = %L where id = %L', 'running', 'e1111111-1111-4111-8111-111111111111'), 1);
select t_changed(:'suite', 'member cannot delete an experiment',
  format('delete from public.research_experiments where id = %L', 'e1111111-1111-4111-8111-111111111111'), 0);
select t_true(:'suite', 'member can read an open research document',
  format('select public.can_read_research_document(%L)', :'doc_open'), true);
select t_true(:'suite', 'member cannot read a restricted document without a grant',
  format('select public.can_read_research_document(%L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), false);
select t_visible(:'suite', 'member sees only the storage object they may read', 'select 1 from storage.objects', 1);
select t_rejected(:'suite', 'member cannot upload a research file',
  format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'research-files', :'research_a' || '/member.pdf'));
select t_rejected(:'suite', 'member cannot grant themselves file access',
  format('insert into public.research_document_permissions(document_id, user_id, granted_by) values (%L, %L, %L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', :'member_id', :'member_id'));
select t_rejected(:'suite', 'member cannot create a research task',
  format('insert into public.tasks(title, research_id, created_by) values (%L, %L, %L)', 'Member task', :'research_a', :'member_id'));
reset role;

-- ── supervisor ──────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select t_changed(:'suite', 'supervisor can update the research record',
  format('update public.research set status = %L where id = %L', 'in_review', :'research_a'), 1);
select t_rejected(:'suite', 'supervisor cannot create a new research record',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, %L, %L)', 'Supervisor study', :'super_id', :'super_id'));
select t_allowed(:'suite', 'supervisor can register a dataset',
  format('insert into public.research_datasets(research_id, name, created_by) values (%L, %L, %L)', :'research_a', 'Supervisor dataset', :'super_id'));
select t_rejected(:'suite', 'supervisor cannot attribute a dataset to someone else',
  format('insert into public.research_datasets(research_id, name, created_by) values (%L, %L, %L)', :'research_a', 'Forged dataset', :'member_id'));
select t_allowed(:'suite', 'supervisor can file an ethics approval',
  format('insert into public.research_ethics_approvals(id, research_id, title, authority, status, created_by) values (%L, %L, %L, %L, %L, %L)', 'f1111111-1111-4111-8111-111111111111', :'research_a', 'IRB submission', 'Reid IRB', 'submitted', :'super_id'));
select t_rejected(:'suite', 'an approved ethics record must carry its decision maker',
  format('update public.research_ethics_approvals set status = %L where id = %L', 'approved', 'f1111111-1111-4111-8111-111111111111'), '23514');
select t_changed(:'suite', 'supervisor can record a complete ethics decision',
  format('update public.research_ethics_approvals set status = %L, decided_at = now(), decided_by = %L where id = %L', 'approved', :'super_id', 'f1111111-1111-4111-8111-111111111111'), 1);
select t_allowed(:'suite', 'supervisor can record a publication with a valid DOI',
  format('insert into public.research_publications(research_id, title, doi, status, created_by) values (%L, %L, %L, %L, %L)', :'research_a', 'Reid paper', '10.1234/reid.2026.001', 'submitted', :'super_id'));
select t_rejected(:'suite', 'a malformed DOI is rejected',
  format('insert into public.research_publications(research_id, title, doi, created_by) values (%L, %L, %L, %L)', :'research_a', 'Bad DOI paper', 'not-a-doi', :'super_id'), '23514');
select t_allowed(:'suite', 'supervisor can add a teammate',
  format('insert into public.research_members(research_id, user_id) values (%L, %L)', :'research_a', :'outsider_id'));
select t_changed(:'suite', 'supervisor can update a member experiment',
  format('update public.research_experiments set status = %L where id = %L', 'completed', 'e1111111-1111-4111-8111-111111111111'), 1);
select t_allowed(:'suite', 'supervisor can grant a colleague access to a restricted file',
  format('insert into public.research_document_permissions(document_id, user_id, granted_by) values (%L, %L, %L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', :'member_id', :'super_id'));
select t_rejected(:'suite', 'supervisor cannot forge the granter of a file permission',
  format('insert into public.research_document_permissions(document_id, role, granted_by) values (%L, %L, %L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hr', :'owner_id'));
select t_allowed(:'suite', 'supervisor can grant a whole role read access',
  format('insert into public.research_document_permissions(document_id, role, granted_by) values (%L, %L, %L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hr', :'super_id'));
select t_allowed(:'suite', 'supervisor can upload into their own research folder',
  format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'research-files', :'research_a' || '/protocol.pdf'));
select t_rejected(:'suite', 'supervisor cannot upload into an unrelated research folder',
  format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'research-files', :'research_b' || '/leak.pdf'));
select t_allowed(:'suite', 'supervisor can create a research task',
  format('insert into public.tasks(id, title, research_id, assignee_id, created_by) values (%L, %L, %L, %L, %L)', '0a111111-1111-4111-8111-111111111111', 'Run the pilot', :'research_a', :'member_id', :'super_id'));
select t_visible(:'suite', 'supervisor sees the research activity feed', 'select 1 from public.research_activity', null);
reset role;

-- ── grants take effect for the researcher and the HR role ───────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select t_true(:'suite', 'a direct grant opens the restricted document to the member',
  format('select public.can_read_research_document(%L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), true);
select t_visible(:'suite', 'member now sees their assigned research task',
  format('select 1 from public.tasks where id = %L', '0a111111-1111-4111-8111-111111111111'), 1);
select t_changed(:'suite', 'assignee can move their own research task',
  format('update public.tasks set status = %L where id = %L', 'in_progress', '0a111111-1111-4111-8111-111111111111'), 1);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';
select t_true(:'suite', 'a role grant opens the restricted document to HR',
  format('select public.can_read_research_document(%L)', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), true);
select t_visible(:'suite', 'HR without membership still sees no research rows', 'select 1 from public.research', 1);
reset role;

-- ── owner ───────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select t_visible(:'suite', 'owner sees every research record', 'select 1 from public.research', 2);
select t_allowed(:'suite', 'owner can create research',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, %L, %L)', 'Owner study', :'super_id', :'owner_id'));
select t_rejected(:'suite', 'owner cannot attribute a new research record to someone else',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, %L, %L)', 'Forged study', :'super_id', :'super_id'));
select t_rejected(:'suite', 'research must always name a supervisor',
  format('insert into public.research(title, supervisor_id, created_by) values (%L, null, %L)', 'Orphan study', :'owner_id'));
reset role;

-- ── audit, activity and notification side effects ───────────────────────────
select t_visible(:'suite', 'membership changes notify the researcher',
  format('select 1 from public.notifications where kind = %L and user_id = %L', 'research_membership', :'member_id'), 1);
select t_visible(:'suite', 'an ethics decision notifies the supervisor',
  format('select 1 from public.notifications where kind = %L and user_id = %L', 'research_ethics', :'super_id'), 1);
select t_visible(:'suite', 'the research activity feed recorded the supervisor dataset',
  format('select 1 from public.research_activity where entity_type = %L and actor_id = %L', 'research_datasets', :'super_id'), 1);
select t_visible(:'suite', 'ethics approvals are written to the audit log',
  format('select 1 from public.audit_logs where table_name = %L', 'research_ethics_approvals'), null);
select t_true(:'suite', 'the research bucket is private',
  format('select not public from storage.buckets where id = %L', 'research-files'), true);
select t_visible(:'suite', 'every research table publishes to Realtime',
  $q$select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('research','research_members','research_datasets','research_experiments',
                       'research_ethics_approvals','research_publications','research_documents','research_activity')$q$, 8);

\o
select label, case when ok then 'PASS' else 'FAIL' end as result, detail
from public.test_results where suite = :'suite' order by id;
select t_finish(:'suite');
rollback;
