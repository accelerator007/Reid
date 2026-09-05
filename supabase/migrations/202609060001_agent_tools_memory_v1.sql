-- Governed agent tools, independent prompts and scoped memory V1.

create table public.agent_tools (
  id text primary key,
  name_ar text not null,
  name_en text not null,
  description text not null,
  operation text not null check (operation in ('read','create','update','publish')),
  approval_level int not null check (approval_level between 0 and 4),
  input_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_tool_assignments (
  agent_id text not null references public.agents(id) on delete cascade,
  tool_id text not null references public.agent_tools(id) on delete cascade,
  primary key (agent_id, tool_id)
);

create table public.agent_tool_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_id text not null references public.agents(id),
  tool_id text not null references public.agent_tools(id),
  requested_by uuid not null references public.profiles(id),
  arguments_hash text not null,
  status text not null check (status in ('succeeded','failed')),
  result_preview text,
  error text,
  created_at timestamptz not null default now()
);

alter table public.agent_tools enable row level security;
alter table public.agent_tool_assignments enable row level security;
alter table public.agent_tool_executions enable row level security;

create policy agent_tools_admin_read on public.agent_tools for select to authenticated using (public.is_admin());
create policy agent_tool_assignments_admin_read on public.agent_tool_assignments for select to authenticated using (public.is_admin());
create policy agent_tool_executions_admin_read on public.agent_tool_executions for select to authenticated using (public.is_admin());

create trigger audit_agent_tools after insert or update or delete on public.agent_tools for each row execute function public.audit_row();
create trigger audit_agent_tool_assignments after insert or update or delete on public.agent_tool_assignments for each row execute function public.audit_row();
create trigger audit_agent_tool_executions after insert or update or delete on public.agent_tool_executions for each row execute function public.audit_row();

alter table public.memories
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists source_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists title text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists memories_class_scope_recent
  on public.memories(classification, scope, scope_id, created_at desc);

insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema) values
 ('projects.list','عرض المشاريع','List projects','Read the bounded project portfolio.','read',0,'{}'),
 ('tasks.list','عرض المهام','List tasks','Read current project and research tasks.','read',0,'{}'),
 ('tasks.create','إنشاء مهمة','Create task','Create an assigned project or research task.','create',1,'{"required":["title"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"project_id":{"type":"string"},"research_id":{"type":"string"},"assignee_id":{"type":"string"},"priority":{"type":"integer"},"due_at":{"type":"string"}}}'),
 ('crm.pipeline','عرض مسار المبيعات','Read CRM pipeline','Read leads, deals and follow-ups.','read',0,'{}'),
 ('crm.follow_up.create','إنشاء متابعة','Create follow-up','Create a governed CRM follow-up activity.','create',1,'{"required":["subject"],"properties":{"subject":{"type":"string"},"lead_id":{"type":"string"},"deal_id":{"type":"string"},"contact_id":{"type":"string"},"company_id":{"type":"string"},"owner_id":{"type":"string"},"due_at":{"type":"string"},"notes":{"type":"string"}}}'),
 ('people.list','دليل الموظفين','List people','Read employee directory fields.','read',0,'{}'),
 ('applications.list','عرض طلبات الانضمام','List applications','Read join applications and CV metadata.','read',0,'{}'),
 ('onboarding.create','إضافة بند تهيئة','Create onboarding item','Create an onboarding checklist item.','create',1,'{"required":["user_id","title_ar","title_en"],"properties":{"user_id":{"type":"string"},"title_ar":{"type":"string"},"title_en":{"type":"string"},"due_date":{"type":"string"}}}'),
 ('finance.budgets','عرض الميزانيات','Read budgets','Read project budgets and CRM pipeline values.','read',0,'{}'),
 ('projects.budget.update','تعديل ميزانية مشروع','Update project budget','Change a project budget after mandatory human approval.','update',3,'{"required":["project_id","budget"],"properties":{"project_id":{"type":"string"},"budget":{"type":"number"},"currency":{"type":"string"}}}'),
 ('content.context','سياق المحتوى','Read content context','Read announcements and public projects.','read',0,'{}'),
 ('content.draft.create','إنشاء مسودة','Create content draft','Create a bilingual unpublished content draft.','create',1,'{"required":["title_ar","title_en","body_ar","body_en"],"properties":{"title_ar":{"type":"string"},"title_en":{"type":"string"},"body_ar":{"type":"string"},"body_en":{"type":"string"}}}'),
 ('content.publish','نشر محتوى','Publish content','Publish an approved content draft internally.','publish',2,'{"required":["draft_id"],"properties":{"draft_id":{"type":"string"}}}'),
 ('knowledge.search','البحث في المعرفة','Search knowledge','Search authorized document metadata and scoped memories.','read',0,'{"required":["query"],"properties":{"query":{"type":"string"},"project_id":{"type":"string"},"department_id":{"type":"string"}}}')
on conflict (id) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
  operation=excluded.operation,approval_level=excluded.approval_level,input_schema=excluded.input_schema,updated_at=now();

insert into public.agent_tool_assignments(agent_id,tool_id) values
 ('ceo','projects.list'),('ceo','tasks.list'),('ceo','tasks.create'),('ceo','crm.pipeline'),('ceo','finance.budgets'),
 ('operations','projects.list'),('operations','tasks.list'),('operations','tasks.create'),
 ('analytics','projects.list'),('analytics','tasks.list'),('analytics','finance.budgets'),
 ('sales','crm.pipeline'),('sales','crm.follow_up.create'),
 ('support','crm.pipeline'),('support','crm.follow_up.create'),('support','knowledge.search'),
 ('hr','people.list'),('hr','applications.list'),('hr','onboarding.create'),
 ('finance','finance.budgets'),('finance','projects.budget.update'),
 ('marketing','content.context'),('marketing','content.draft.create'),
 ('content','content.context'),('content','content.draft.create'),('content','content.publish'),
 ('competitor','content.context'),('knowledge','knowledge.search'),('knowledge','projects.list')
on conflict do nothing;

-- Drafts are intentionally separate from published announcements.
create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null, title_en text not null, body_ar text not null, body_en text not null,
  status text not null default 'draft' check(status in ('draft','published')),
  created_by uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.content_drafts enable row level security;
create policy content_drafts_admin_read on public.content_drafts for select to authenticated using(public.is_admin());
create trigger audit_content_drafts after insert or update or delete on public.content_drafts for each row execute function public.audit_row();

-- Each agent has its own operating contract. Tools are still enforced by the
-- assignment table and gateway; prompt text is never an authorization layer.
update public.agents set system_prompt = case id
 when 'ceo' then 'You are Reid CEO Orchestrator. Turn Owner strategy into governed work. Coordinate projects, tasks, CRM and budgets. Never execute L3/L4 actions without human approval.'
 when 'operations' then 'You are Reid Operations Agent. Diagnose delivery risks and manage project tasks. Use only assigned project/task tools and state every change precisely.'
 when 'marketing' then 'You are Reid Marketing Agent. Build bilingual growth plans from public brand context. Create drafts; never claim publication without an approved publish tool result.'
 when 'content' then 'You are Reid Content and Social Agent. Produce concise Arabic and English drafts. Publication is L2 and must remain pending until a human approves.'
 when 'sales' then 'You are Reid Sales and CRM Agent. Work only with authorized CRM records, next actions and follow-ups. Do not invent customer commitments.'
 when 'analytics' then 'You are Reid Analytics Agent. Explain project, task, budget and pipeline metrics with uncertainty and source boundaries.'
 when 'knowledge' then 'You are Reid Knowledge Agent. Answer only from authorized document metadata and scoped memories. Cite record titles/ids and say when evidence is missing.'
 when 'hr' then 'You are Reid HR Agent. Handle employee and applicant data as restricted. Explain CV or onboarding assessments and never make a final hiring decision.'
 when 'finance' then 'You are Reid Finance Agent. Analyze budgets and values. Budget changes are L3; payments and critical deletion are L4 and unavailable here.'
 when 'support' then 'You are Reid Customer Support Agent. Use approved knowledge and CRM context, create follow-ups, and escalate commitments to Sales.'
 when 'competitor' then 'You are Reid Competitor Intelligence Agent. Analyze only public market and company context; label inferences and sources.'
 else system_prompt end,
 permissions = coalesce((select jsonb_agg(a.tool_id order by a.tool_id) from public.agent_tool_assignments a where a.agent_id=agents.id),'[]'::jsonb),
 configuration = configuration || jsonb_build_object('memory_scopes', case id
   when 'ceo' then jsonb_build_array('company','department','project','agent')
   when 'operations' then jsonb_build_array('company','department','project','agent')
   when 'hr' then jsonb_build_array('company','department','user','agent')
   when 'finance' then jsonb_build_array('company','project','agent')
   when 'knowledge' then jsonb_build_array('company','department','project','user','agent')
   else jsonb_build_array('company','agent') end),
 updated_at=now();

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_tool_executions')
  then alter publication supabase_realtime add table public.agent_tool_executions; end if;
end $$;
