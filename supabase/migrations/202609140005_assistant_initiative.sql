begin;

-- A personal assistant occasionally starts the conversation. A bot always
-- waits. Initiative is opt-in per employee and off until an Owner turns it on,
-- because an unwanted message is worse than a missing one.
alter table public.whatsapp_admin_profiles
  add column if not exists proactive_enabled boolean not null default false,
  add column if not exists briefing_hour smallint not null default 8
    check (briefing_hour between 0 and 23);

create table if not exists public.assistant_nudges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('morning_brief','stale_action','overdue_work')),
  subject_day date not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (owner_id, kind, subject_day)
);
create index if not exists assistant_nudges_recent on public.assistant_nudges(owner_id, created_at desc);

alter table public.assistant_nudges enable row level security;
revoke all on public.assistant_nudges from anon, authenticated;
grant select on public.assistant_nudges to authenticated;
grant all on public.assistant_nudges to service_role;
create policy assistant_nudges_self_read on public.assistant_nudges
  for select to authenticated
  using (owner_id = auth.uid() or public.has_role('owner') or public.has_role('super_admin'));

comment on table public.assistant_nudges is
  'Every message the assistant started itself. The unique key is the daily cap, and the table is the audit trail.';
comment on column public.whatsapp_admin_profiles.proactive_enabled is
  'Opt-in per employee. The assistant never messages first until an Owner enables it.';

commit;
