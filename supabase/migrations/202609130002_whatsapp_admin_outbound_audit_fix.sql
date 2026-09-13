begin;

-- The trigger snapshot is JSON, so requester_id must be cast back to uuid
-- before writing the audit receipt.
create or replace function public.audit_whatsapp_pending_send() returns trigger
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

commit;
