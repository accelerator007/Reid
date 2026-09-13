begin;

-- A message addressed to another administrator is an external side effect.
-- Keep the exact preview until the requesting administrator confirms it, then
-- retain a small receipt without mixing it into the agent's long-term memory.
create table public.whatsapp_pending_sends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  requester_phone text not null check (requester_phone ~ '^[1-9][0-9]{7,14}$'),
  target_phone text not null check (target_phone ~ '^[1-9][0-9]{7,14}$'),
  target_name text not null check (length(target_name) between 1 and 120),
  body text not null check (length(body) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending','sending','sent','uncertain','cancelled','expired')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_pending_sends_requester_recent
  on public.whatsapp_pending_sends(requester_id,status,created_at desc);

alter table public.whatsapp_pending_sends enable row level security;
revoke all on public.whatsapp_pending_sends from anon, authenticated;
grant select on public.whatsapp_pending_sends to authenticated;
grant all on public.whatsapp_pending_sends to service_role;

create policy whatsapp_pending_sends_owner_read on public.whatsapp_pending_sends
for select to authenticated
using (public.has_role('owner') or public.has_role('super_admin'));

create function public.audit_whatsapp_pending_send() returns trigger
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values((snapshot->>'requester_id')::uuid,tg_op,tg_table_name,snapshot->>'id',jsonb_build_object(
    'target_name',snapshot->>'target_name',
    'status',snapshot->>'status',
    'sent_at',snapshot->>'sent_at'
  ));
  return case when tg_op='DELETE' then old else new end;
end $$;

revoke all on function public.audit_whatsapp_pending_send() from public,anon,authenticated;
create trigger audit_whatsapp_pending_sends after insert or update or delete on public.whatsapp_pending_sends
for each row execute function public.audit_whatsapp_pending_send();

commit;
