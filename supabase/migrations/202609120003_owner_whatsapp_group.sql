begin;

-- Exact QR group allow-list. The Reid service may bootstrap one row only after
-- an enabled Owner addresses the linked Reid account inside the named group.
create table public.whatsapp_qr_groups (
  jid text primary key check (jid ~ '^[0-9]+@g[.]us$'),
  display_name text not null check (length(display_name) between 1 and 120),
  enabled boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_qr_groups enable row level security;
revoke all on public.whatsapp_qr_groups from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_qr_groups to authenticated;
grant all on public.whatsapp_qr_groups to service_role;

create policy whatsapp_qr_groups_owner_manage on public.whatsapp_qr_groups
for all to authenticated
using (public.has_role('owner') or public.has_role('super_admin'))
with check (public.has_role('owner') or public.has_role('super_admin'));

-- Keep the authenticated human identity attached to every inbound QR record.
-- Outbound messages intentionally have no sender_phone.
alter table public.qr_messages add column sender_phone text
  check (sender_phone is null or sender_phone ~ '^[1-9][0-9]{7,14}$');
alter table public.qr_jobs add column sender_phone text
  check (sender_phone is null or sender_phone ~ '^[1-9][0-9]{7,14}$');

update public.qr_messages message set sender_phone=split_part(conversation.jid,'@',1)
from public.qr_conversations conversation
where message.conversation_id=conversation.id and message.direction='inbound'
  and conversation.jid ~ '^[1-9][0-9]{7,14}@s[.]whatsapp[.]net$';
update public.qr_jobs job set sender_phone=split_part(conversation.jid,'@',1)
from public.qr_conversations conversation
where job.conversation_id=conversation.id
  and conversation.jid ~ '^[1-9][0-9]{7,14}@s[.]whatsapp[.]net$';

create function public.audit_whatsapp_qr_group() returns trigger
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),tg_op,tg_table_name,snapshot->>'jid',jsonb_build_object(
    'display_name',snapshot->>'display_name','enabled',snapshot->>'enabled'
  ));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.audit_whatsapp_qr_group() from public,anon,authenticated;
create trigger audit_whatsapp_qr_groups after insert or update or delete on public.whatsapp_qr_groups
for each row execute function public.audit_whatsapp_qr_group();

commit;
