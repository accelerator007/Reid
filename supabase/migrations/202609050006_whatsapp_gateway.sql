create table if not exists public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  sender_phone text not null,
  message_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_commands (
  id uuid primary key default gen_random_uuid(),
  sender_phone text not null,
  message_id text not null unique,
  command_text text not null,
  status text not null default 'received' check (status in ('received','queued','pending_approval','completed','rejected','failed')),
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_events enable row level security;
alter table public.whatsapp_commands enable row level security;

create policy whatsapp_events_owner_read on public.whatsapp_events for select to authenticated
  using (public.has_role('owner'));
create policy whatsapp_commands_owner_read on public.whatsapp_commands for select to authenticated
  using (public.has_role('owner'));

revoke all on public.whatsapp_events, public.whatsapp_commands from anon, authenticated;
grant select on public.whatsapp_events, public.whatsapp_commands to authenticated;

create function public.audit_whatsapp_command() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), tg_op, 'whatsapp_commands', coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('status', old.status, 'agent_run_id', old.agent_run_id) end,
    case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('status', new.status, 'agent_run_id', new.agent_run_id) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger audit_whatsapp_commands after insert or update or delete on public.whatsapp_commands
for each row execute function public.audit_whatsapp_command();
