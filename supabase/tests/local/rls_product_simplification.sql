begin;

do $$
begin
  if to_regclass('public.research') is not null
    or to_regclass('public.workshops') is not null
    or to_regclass('public.forms') is not null
    or to_regclass('public.reid_meetings') is not null then
    raise exception 'retired product tables still exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'research_id'
  ) then
    raise exception 'tasks.research_id still exists';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'task_scope_read'
  ) then
    raise exception 'task_scope_read was not recreated';
  end if;
end $$;

rollback;
