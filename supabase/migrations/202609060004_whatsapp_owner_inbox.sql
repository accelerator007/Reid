create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  sender_phone text not null unique,
  display_name text,
  bot_mode text not null default 'active' check (bot_mode in ('active','paused','human')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','read','failed')),
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_conversations_owner_read on public.whatsapp_conversations
  for select to authenticated using (public.has_role('owner'));
create policy whatsapp_messages_owner_read on public.whatsapp_messages
  for select to authenticated using (public.has_role('owner'));

revoke all on public.whatsapp_conversations, public.whatsapp_messages from anon, authenticated;
grant select on public.whatsapp_conversations, public.whatsapp_messages to authenticated;

create function public.audit_whatsapp_inbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_id text; metadata jsonb; snapshot jsonb;
begin
  if tg_op = 'DELETE' then snapshot := to_jsonb(old); else snapshot := to_jsonb(new); end if;
  row_id := snapshot ->> 'id';
  metadata := case
    when tg_table_name = 'whatsapp_conversations' then jsonb_build_object(
      'bot_mode', snapshot ->> 'bot_mode', 'assigned_to', snapshot ->> 'assigned_to')
    else jsonb_build_object(
      'direction', snapshot ->> 'direction', 'delivery_status', snapshot ->> 'delivery_status')
  end;
  insert into public.audit_logs(actor_id, action, table_name, record_id, new_data)
  values (null, tg_op, tg_table_name, row_id, metadata);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

revoke execute on function public.audit_whatsapp_inbox() from public, anon, authenticated;
create trigger audit_whatsapp_conversations after insert or update or delete on public.whatsapp_conversations
for each row execute function public.audit_whatsapp_inbox();
create trigger audit_whatsapp_messages after insert or update or delete on public.whatsapp_messages
for each row execute function public.audit_whatsapp_inbox();

alter publication supabase_realtime add table public.whatsapp_conversations;
alter publication supabase_realtime add table public.whatsapp_messages;
