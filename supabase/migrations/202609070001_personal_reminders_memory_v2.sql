create table public.personal_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  whatsapp_phone text not null,
  reminder_text text not null check (length(reminder_text) between 1 and 1000),
  due_at timestamptz not null,
  timezone text not null default 'Asia/Muscat',
  status text not null default 'scheduled' check(status in ('scheduled','sending','sent','cancelled','failed')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_reminders_due on public.personal_reminders(status,due_at);
alter table public.personal_reminders enable row level security;
create policy personal_reminders_owner_read on public.personal_reminders for select to authenticated
using(owner_id=auth.uid() or public.has_any_role(array['owner','super_admin']::public.app_role[]));
create policy personal_reminders_owner_write on public.personal_reminders for all to authenticated
using(owner_id=auth.uid() or public.has_any_role(array['owner','super_admin']::public.app_role[]))
with check(owner_id=auth.uid() or public.has_any_role(array['owner','super_admin']::public.app_role[]));
create trigger audit_personal_reminders after insert or update or delete on public.personal_reminders
for each row execute function public.audit_row();

alter table public.memories add column if not exists memory_kind text not null default 'fact'
check(memory_kind in ('fact','preference','style','temporary'));
alter table public.memories add column if not exists expires_at timestamptz;
create index if not exists memories_expiry on public.memories(expires_at) where expires_at is not null;

insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema) values
 ('reminders.list','عرض التذكيرات','List reminders','List the requesting user scheduled reminders.','read',0,'{}'),
 ('reminders.create','إنشاء تذكير','Create reminder','Create a personal WhatsApp reminder.','create',1,'{"required":["reminder_text","due_at","whatsapp_phone"]}'),
 ('reminders.cancel','إلغاء تذكير','Cancel reminder','Cancel a scheduled personal reminder.','update',1,'{"required":["reminder_id"]}')
on conflict(id) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
operation=excluded.operation,approval_level=excluded.approval_level,input_schema=excluded.input_schema,enabled=true;

insert into public.agent_tool_assignments(agent_id,tool_id) values
 ('ceo','reminders.list'),('ceo','reminders.create'),('ceo','reminders.cancel'),
 ('operations','reminders.list'),('operations','reminders.create'),('operations','reminders.cancel')
on conflict do nothing;
