-- A durable, private team room where company administrators can work with
-- Reid's governed agents. Agent replies are written only by the service role
-- from a real agent run; browser clients may insert only their own messages.

create table public.agent_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'فريق ريّد' check (length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by)
);

create table public.agent_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.agent_rooms(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('user','agent','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_agent_id text references public.agents(id) on delete set null,
  body text not null check (length(body) between 1 and 12000),
  mentions text[] not null default '{}',
  run_id uuid unique references public.agent_runs(id) on delete set null,
  reply_to uuid references public.agent_room_messages(id) on delete set null,
  state text not null default 'completed' check (state in ('pending_approval','queued','running','completed','failed','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (sender_kind='user' and sender_user_id is not null and sender_agent_id is null and run_id is null and state='completed')
    or (sender_kind='agent' and sender_user_id is null and sender_agent_id is not null and run_id is not null)
    or (sender_kind='system' and sender_user_id is null and sender_agent_id is null and run_id is null)
  )
);

create index agent_room_messages_thread on public.agent_room_messages(room_id, created_at);
create index agent_room_messages_active on public.agent_room_messages(room_id, state)
  where state in ('pending_approval','queued','running');

create or replace function public.touch_agent_room()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.agent_room_messages parent
    where parent.id=new.reply_to and parent.room_id=new.room_id
  ) then
    raise exception using errcode='23514', message='agent_room_reply_must_share_room';
  end if;
  update public.agent_rooms set updated_at=now() where id=new.room_id;
  new.updated_at=now();
  return new;
end;
$$;

revoke all on function public.touch_agent_room() from public, anon, authenticated;
create trigger agent_room_messages_touch before insert or update on public.agent_room_messages
for each row execute function public.touch_agent_room();

alter table public.agent_rooms enable row level security;
alter table public.agent_room_messages enable row level security;

revoke all on public.agent_rooms, public.agent_room_messages from anon, authenticated;
grant select, insert, update, delete on public.agent_rooms to authenticated;
grant select, insert on public.agent_room_messages to authenticated;

create policy agent_rooms_own_read on public.agent_rooms for select to authenticated
using (created_by=auth.uid() and public.is_admin() and public.is_account_active());
create policy agent_rooms_own_insert on public.agent_rooms for insert to authenticated
with check (created_by=auth.uid() and public.is_admin() and public.is_account_active());
create policy agent_rooms_own_update on public.agent_rooms for update to authenticated
using (created_by=auth.uid() and public.is_admin() and public.is_account_active())
with check (created_by=auth.uid() and public.is_admin() and public.is_account_active());
create policy agent_rooms_own_delete on public.agent_rooms for delete to authenticated
using (created_by=auth.uid() and public.is_admin() and public.is_account_active());

create policy agent_room_messages_own_read on public.agent_room_messages for select to authenticated
using (exists (
  select 1 from public.agent_rooms room
  where room.id=room_id and room.created_by=auth.uid()
    and public.is_admin() and public.is_account_active()
));

create policy agent_room_messages_user_insert on public.agent_room_messages for insert to authenticated
with check (
  sender_kind='user' and sender_user_id=auth.uid() and sender_agent_id is null
  and run_id is null and state='completed' and error is null
  and exists (
    select 1 from public.agent_rooms room
    where room.id=room_id and room.created_by=auth.uid()
      and public.is_admin() and public.is_account_active()
  )
);

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_room_messages')
  then alter publication supabase_realtime add table public.agent_room_messages; end if;
end $$;

comment on table public.agent_rooms is 'One private governed-agent team room per company administrator.';
comment on table public.agent_room_messages is 'Durable human and verified agent messages. Browser clients cannot forge agent senders.';
