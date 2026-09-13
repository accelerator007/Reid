begin;

alter table public.finance_documents drop constraint finance_documents_project_id_fkey;
alter table public.finance_documents add constraint finance_documents_project_id_fkey
  foreign key(project_id) references public.projects(id) on delete set null;

-- Cascaded child deletes run after the parent project is no longer visible.
-- Keep recording ordinary child deletion, but skip feed writes during the
-- parent cascade because the activity row would immediately be orphaned.
create or replace function public.log_project_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  new_row jsonb := case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  old_row jsonb := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  project_value text;
  record_id text;
begin
  if tg_table_name='projects' and tg_op='DELETE' then return old; end if;
  project_value:=coalesce(
    new_row->>'project_id',old_row->>'project_id',
    case when tg_table_name='projects' then new_row->>'id' end,
    case when tg_table_name='projects' then old_row->>'id' end
  );
  if project_value is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=project_value::uuid) then return old; end if;
  record_id:=coalesce(new_row->>'id',old_row->>'id',new_row->>'user_id',old_row->>'user_id');
  insert into public.project_activity(project_id,actor_id,action,entity_type,entity_id,details)
  values(project_value::uuid,auth.uid(),tg_op,tg_table_name,record_id,jsonb_build_object('status',coalesce(new_row->>'status','')));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.log_project_activity() from public,anon;

commit;
