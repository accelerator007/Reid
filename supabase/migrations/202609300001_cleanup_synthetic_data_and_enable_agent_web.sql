begin;

-- Production contained only two real accounts. The thirteen rows below were
-- created by the historical browser, employee and research QA suites. Keep the
-- cleanup exact: no name or email wildcard can ever remove a future account.
create temporary table reid_synthetic_users(id uuid primary key) on commit drop;
insert into reid_synthetic_users(id) values
  ('c09e5dfa-0aea-4ebd-bc70-02aff23ed3df'),
  ('958ff10e-3044-4899-b323-314f9d367ee7'),
  ('c21946cb-bda6-4a17-a56c-db06c8c6a5ef'),
  ('c5f767ad-b45d-4534-870e-91eea5a335cc'),
  ('0323cc97-8372-426e-8c8e-0a6ccae25ffb'),
  ('6aa92e4e-ca5c-46bf-bf93-d4ff4960bdb1'),
  ('f075642a-43c1-484b-8313-53acf07a620a'),
  ('00fc42dd-7730-46ea-8220-2a1d15bbef06'),
  ('34e4c7b0-a5ad-45ef-8c8c-dde7fbd401b2'),
  ('8196483d-7a0e-4689-87b1-8d09efdd8d16'),
  ('bcb84c83-beb9-4b5e-9f2a-3369fec2c01b'),
  ('8d5ed3c2-1a0d-4fe1-9301-f6e7f7ec3691'),
  ('371b68d5-686e-4145-a696-fe76384d4276');

delete from public.timesheets where user_id in (select id from reid_synthetic_users);
delete from public.performance_reviews where user_id in (select id from reid_synthetic_users) or reviewer_id in (select id from reid_synthetic_users);
delete from public.employee_kpis where user_id in (select id from reid_synthetic_users) or set_by in (select id from reid_synthetic_users);
delete from public.employee_documents where owner_id in (select id from reid_synthetic_users) or uploaded_by in (select id from reid_synthetic_users);
delete from public.tasks where created_by in (select id from reid_synthetic_users) or assignee_id in (select id from reid_synthetic_users);

-- The generic activity trigger cannot log a cascading DELETE after its parent
-- research row has gone: the log itself has a foreign key to that parent. Keep
-- the cleanup atomic by pausing only those audit triggers for these exact rows.
alter table public.research disable trigger research_activity_research;
alter table public.research_members disable trigger research_activity_research_members;
alter table public.research_datasets disable trigger research_activity_research_datasets;
alter table public.research_experiments disable trigger research_activity_research_experiments;
alter table public.research_ethics_approvals disable trigger research_activity_research_ethics_approvals;
alter table public.research_publications disable trigger research_activity_research_publications;
alter table public.research_documents disable trigger research_activity_research_documents;
delete from public.research where id in (
  '280b7f06-a00b-4253-8434-a3a8a5ecdd19','908cf9ac-c140-4dde-b786-4380ebc10fa0','c4dc99c3-b3c9-4b62-a2d4-d3b7a7767f42'
);
alter table public.research enable trigger research_activity_research;
alter table public.research_members enable trigger research_activity_research_members;
alter table public.research_datasets enable trigger research_activity_research_datasets;
alter table public.research_experiments enable trigger research_activity_research_experiments;
alter table public.research_ethics_approvals enable trigger research_activity_research_ethics_approvals;
alter table public.research_publications enable trigger research_activity_research_publications;
alter table public.research_documents enable trigger research_activity_research_documents;
delete from public.applications where id in (
  '75e66f61-9f6c-44aa-823a-37fc1539c0e1','1593312d-b7da-40c5-aee2-dee8d75022aa','02164635-9519-487f-bb6f-210871e86d7d'
);
delete from public.departments where id in (
  '61555f2f-767d-4654-9d45-2300f82022db','67509ecb-b0c4-46bb-ae30-039378466f22','bd68bd31-5ddd-48b7-a124-d32690837700'
);

-- Remove generated answers, memory and delivery-ledger rows whose only source
-- was the synthetic company data deleted above. Owner-authored prompts remain.
delete from public.agent_room_messages where body ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.agent_runs where coalesce(output_preview,'') ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.memories where content ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.qr_jobs where input ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.qr_messages where body ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.qr_outbox where body ~* '(Agent matrix|Staging (Project|Kanban)|QA manager task|Remote research task|Reid QA (manager|employee))';
delete from public.notifications where user_id in (select id from reid_synthetic_users)
  or entity_id in (
    '75e66f61-9f6c-44aa-823a-37fc1539c0e1','1593312d-b7da-40c5-aee2-dee8d75022aa','02164635-9519-487f-bb6f-210871e86d7d',
    '280b7f06-a00b-4253-8434-a3a8a5ecdd19','908cf9ac-c140-4dde-b786-4380ebc10fa0','c4dc99c3-b3c9-4b62-a2d4-d3b7a7767f42'
  );

-- All restrictive child rows have been removed. Deleting the Auth identities
-- now cascades profiles, roles, account controls and their remaining private
-- per-user rows without touching the two real accounts.
delete from auth.users where id in (select id from reid_synthetic_users);

-- QA audit history contains copies of deleted personal/test rows. Purge it
-- after the deletes so the deletion-trigger entries are removed as well.
delete from public.audit_logs where actor_id in (select id from reid_synthetic_users)
  or coalesce(old_data::text,'') ~* '(reid[._+-](qa|e2e|research)|reid-research-|Staging Remote|QA Department|QA manager task|QA private document)'
  or coalesce(new_data::text,'') ~* '(reid[._+-](qa|e2e|research)|reid-research-|Staging Remote|QA Department|QA manager task|QA private document)';

-- The tools existed but their assignments disappeared during the old project
-- recovery. Every active specialist may search/read public sources. Tool input
-- is the explicit user argument only; company context is never sent to Tavily.
insert into public.agent_tool_assignments(agent_id,tool_id)
select a.id,t.id from public.agents a
cross join (values ('web.search'),('web.read')) as t(id)
where a.enabled and a.id <> 'finance'
on conflict do nothing;

commit;
