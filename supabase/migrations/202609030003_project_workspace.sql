-- Project workspace V1: lifecycle, members, Kanban, milestones, meetings,
-- budgets, KPIs, private files, activity, GitHub links, RLS and Realtime.

alter table public.projects
  add column if not exists description text,
  add column if not exists client_name text,
  add column if not exists start_date date,
  add column if not exists target_date date,
  add column if not exists currency text not null default 'OMR',
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, description text, due_date date, status text not null default 'planned'
    check(status in ('planned','in_progress','completed','blocked')), completed_at timestamptz,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.project_meetings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, agenda text, starts_at timestamptz not null, ends_at timestamptz not null,
  location text, notes text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create table if not exists public.project_kpis (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, target_value numeric not null, current_value numeric not null default 0, unit text not null default '%',
  status text not null default 'on_track' check(status in ('on_track','at_risk','achieved')),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, storage_path text not null unique, category text not null default 'general', restricted boolean not null default false,
  uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.project_file_permissions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.project_files(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, role public.app_role,
  can_read boolean not null default true, can_write boolean not null default false,
  granted_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check((user_id is not null)::int+(role is not null)::int=1), unique nulls not distinct(file_id,user_id,role)
);
create table if not exists public.project_activity (
  id bigint generated always as identity primary key, project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id text,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);

create or replace function public.is_project_member(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_account_active() and exists(select 1 from public.project_members where project_id=wanted and user_id=auth.uid())
$$;
create or replace function public.can_manage_project(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_admin() or exists(select 1 from public.projects where id=wanted and manager_id=auth.uid())
    or exists(select 1 from public.project_members where project_id=wanted and user_id=auth.uid() and member_role in ('manager','lead'))
$$;
revoke all on function public.is_project_member(uuid) from public,anon; grant execute on function public.is_project_member(uuid) to authenticated;
revoke all on function public.can_manage_project(uuid) from public,anon; grant execute on function public.can_manage_project(uuid) to authenticated;

drop policy if exists project_member_read on public.projects;
create policy projects_scope_read on public.projects for select to authenticated using(public.is_admin() or manager_id=auth.uid() or public.is_project_member(id));
create policy projects_staff_insert on public.projects for insert to authenticated with check(public.is_admin() and manager_id is not null);
create policy projects_manager_update on public.projects for update to authenticated using(public.can_manage_project(id)) with check(public.can_manage_project(id));

alter table public.project_members enable row level security;
create policy project_members_scope_read on public.project_members for select to authenticated using(public.can_manage_project(project_id) or public.is_project_member(project_id));
create policy project_members_manager_write on public.project_members for all to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));

do $$ declare t text; begin foreach t in array array['project_milestones','project_meetings','project_kpis','project_files','project_file_permissions','project_activity'] loop
  execute format('alter table public.%I enable row level security',t);
  if not exists(select 1 from pg_trigger where tgname='audit_'||t) then execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()',t,t); end if;
end loop; end $$;

create policy milestones_scope_read on public.project_milestones for select to authenticated using(public.is_admin() or public.is_project_member(project_id));
create policy milestones_manager_write on public.project_milestones for all to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));
create policy meetings_scope_read on public.project_meetings for select to authenticated using(public.is_admin() or public.is_project_member(project_id));
create policy meetings_manager_write on public.project_meetings for all to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));
create policy project_kpis_scope_read on public.project_kpis for select to authenticated using(public.is_admin() or public.is_project_member(project_id));
create policy project_kpis_manager_write on public.project_kpis for all to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));
create policy project_files_scope_read on public.project_files for select to authenticated using(public.is_admin() or public.is_project_member(project_id));
create policy project_files_manager_write on public.project_files for all to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));
create policy project_file_permissions_scope_read on public.project_file_permissions for select to authenticated
using(public.can_manage_project((select project_id from public.project_files where id=file_id)) or user_id=auth.uid() or (role is not null and public.has_role(role)));
create policy project_file_permissions_manager_write on public.project_file_permissions for all to authenticated
using(public.can_manage_project((select project_id from public.project_files where id=file_id)))
with check(public.can_manage_project((select project_id from public.project_files where id=file_id)) and granted_by=auth.uid());
create policy project_activity_scope_read on public.project_activity for select to authenticated using(public.is_admin() or public.is_project_member(project_id));

create policy project_tasks_manager_insert on public.tasks for insert to authenticated with check(project_id is not null and public.can_manage_project(project_id) and created_by=auth.uid());
create policy project_tasks_manager_update on public.tasks for update to authenticated using(project_id is not null and public.can_manage_project(project_id)) with check(project_id is not null and public.can_manage_project(project_id));
create policy project_tasks_manager_delete on public.tasks for delete to authenticated using(project_id is not null and public.can_manage_project(project_id));

create or replace function public.can_read_project_file(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.project_files f where f.id=wanted and (
    public.can_manage_project(f.project_id) or (not f.restricted and public.is_project_member(f.project_id)) or exists(
      select 1 from public.project_file_permissions fp where fp.file_id=f.id and fp.can_read and
      (fp.user_id=auth.uid() or (fp.role is not null and public.has_role(fp.role)))
    )
  ))
$$;
revoke all on function public.can_read_project_file(uuid) from public,anon; grant execute on function public.can_read_project_file(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('project-files','project-files',false,26214400,array['application/pdf','image/png','image/jpeg','text/plain','text/csv','application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy project_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and exists(
  select 1 from public.project_files f where f.storage_path=name and public.can_read_project_file(f.id)));
create policy project_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and public.can_manage_project(((storage.foldername(name))[1])::uuid));
create policy project_storage_delete on storage.objects for delete to authenticated using(bucket_id='project-files' and exists(
  select 1 from public.project_files f where f.storage_path=name and public.can_manage_project(f.project_id)));

create or replace function public.log_project_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid; rid text; begin
  p:=case when tg_table_name='projects' then coalesce(new.id,old.id) else coalesce(new.project_id,old.project_id) end;
  if p is null then return case when tg_op='DELETE' then old else new end; end if;
  rid:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id');
  insert into public.project_activity(project_id,actor_id,action,entity_type,entity_id,details)
  values(p,auth.uid(),tg_op,tg_table_name,rid,jsonb_build_object('status',coalesce(to_jsonb(new)->>'status','')));
  return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare t text; begin foreach t in array array['projects','project_members','project_milestones','project_meetings','project_kpis','project_files','tasks'] loop
  execute format('create trigger activity_%I after insert or update or delete on public.%I for each row execute function public.log_project_activity()',t,t);
end loop; end $$;

do $$ declare t text; begin foreach t in array array['projects','project_members','project_milestones','project_meetings','project_kpis','project_files','project_activity'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
end loop; end $$;
