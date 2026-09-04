-- Research workspace V1: lifecycle, members, datasets, experiments,
-- ethics approvals, publications/DOI/conference tracking, private documents
-- with per-user/per-role grants, activity feed, notifications, RLS and Realtime.

alter table public.research
  add column if not exists field text,
  add column if not exists start_date date,
  add column if not exists target_date date,
  add column if not exists funding_source text,
  add column if not exists funding_amount numeric(14,2),
  add column if not exists currency text not null default 'OMR',
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.research_datasets (
  id uuid primary key default gen_random_uuid(), research_id uuid not null references public.research(id) on delete cascade,
  name text not null, description text, source text, license text, record_count bigint,
  sensitivity text not null default 'internal' check(sensitivity in ('public','internal','restricted')),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.research_experiments (
  id uuid primary key default gen_random_uuid(), research_id uuid not null references public.research(id) on delete cascade,
  dataset_id uuid references public.research_datasets(id) on delete set null,
  title text not null, hypothesis text, method text,
  status text not null default 'planned' check(status in ('planned','running','completed','failed')),
  started_at timestamptz, ended_at timestamptz, result_summary text, metrics jsonb not null default '{}',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(ended_at is null or started_at is null or ended_at >= started_at)
);
create table if not exists public.research_ethics_approvals (
  id uuid primary key default gen_random_uuid(), research_id uuid not null references public.research(id) on delete cascade,
  title text not null, authority text not null, reference text,
  status text not null default 'draft' check(status in ('draft','submitted','approved','rejected','expired')),
  submitted_at timestamptz, decided_at timestamptz, decided_by uuid references public.profiles(id),
  expires_at date, notes text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(status not in ('approved','rejected') or (decided_at is not null and decided_by is not null))
);
create table if not exists public.research_publications (
  id uuid primary key default gen_random_uuid(), research_id uuid not null references public.research(id) on delete cascade,
  title text not null, authors text,
  venue_type text not null default 'journal' check(venue_type in ('journal','conference','preprint','report','thesis')),
  venue_name text, doi text, url text,
  status text not null default 'draft' check(status in ('draft','submitted','under_review','accepted','published','rejected')),
  submitted_at date, published_at date, event_date date,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(doi is null or doi ~ '^10\.[0-9]{4,9}/[^\s]+$')
);
create table if not exists public.research_documents (
  id uuid primary key default gen_random_uuid(), research_id uuid not null references public.research(id) on delete cascade,
  title text not null, storage_path text not null unique, category text not null default 'general',
  restricted boolean not null default false,
  uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.research_document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.research_documents(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, role public.app_role,
  can_read boolean not null default true, can_write boolean not null default false,
  granted_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check((user_id is not null)::int+(role is not null)::int=1), unique nulls not distinct(document_id,user_id,role)
);
create table if not exists public.research_activity (
  id bigint generated always as identity primary key, research_id uuid not null references public.research(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id text,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);

create or replace function public.is_research_member(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_account_active() and exists(select 1 from public.research_members where research_id=wanted and user_id=auth.uid())
$$;
create or replace function public.can_manage_research(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_admin() or (public.is_account_active() and (
    exists(select 1 from public.research where id=wanted and supervisor_id=auth.uid())
    or exists(select 1 from public.research_members where research_id=wanted and user_id=auth.uid() and member_role in ('supervisor','lead'))
  ))
$$;
revoke all on function public.is_research_member(uuid) from public,anon; grant execute on function public.is_research_member(uuid) to authenticated;
revoke all on function public.can_manage_research(uuid) from public,anon; grant execute on function public.can_manage_research(uuid) to authenticated;

drop policy if exists research_visibility on public.research;
create policy research_scope_read on public.research for select to authenticated
using(is_public or public.is_admin() or (public.is_account_active() and supervisor_id=auth.uid()) or public.is_research_member(id));
create policy research_staff_insert on public.research for insert to authenticated
with check(public.is_admin() and supervisor_id is not null and created_by=auth.uid());
create policy research_manager_update on public.research for update to authenticated
using(public.can_manage_research(id)) with check(public.can_manage_research(id));

create policy research_members_scope_read on public.research_members for select to authenticated
using(public.can_manage_research(research_id) or public.is_research_member(research_id));
create policy research_members_manager_write on public.research_members for all to authenticated
using(public.can_manage_research(research_id)) with check(public.can_manage_research(research_id));

do $$ declare t text; begin foreach t in array array['research_datasets','research_experiments','research_ethics_approvals','research_publications','research_documents','research_document_permissions','research_activity'] loop
  execute format('alter table public.%I enable row level security',t);
  if not exists(select 1 from pg_trigger where tgname='audit_'||t) then execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()',t,t); end if;
end loop; end $$;

create policy research_datasets_scope_read on public.research_datasets for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id));
create policy research_datasets_manager_write on public.research_datasets for all to authenticated
using(public.can_manage_research(research_id)) with check(public.can_manage_research(research_id) and created_by=auth.uid());

create policy research_experiments_scope_read on public.research_experiments for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id));
create policy research_experiments_member_insert on public.research_experiments for insert to authenticated
with check(public.is_research_member(research_id) and created_by=auth.uid());
create policy research_experiments_scope_update on public.research_experiments for update to authenticated
using(public.can_manage_research(research_id) or created_by=auth.uid())
with check(public.can_manage_research(research_id) or created_by=auth.uid());
create policy research_experiments_manager_delete on public.research_experiments for delete to authenticated
using(public.can_manage_research(research_id));

-- Ethics records are readable by the research scope, but only a supervisor or
-- company administrator may create one or record its decision.
create policy research_ethics_scope_read on public.research_ethics_approvals for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id));
create policy research_ethics_manager_write on public.research_ethics_approvals for all to authenticated
using(public.can_manage_research(research_id)) with check(public.can_manage_research(research_id));

create policy research_publications_scope_read on public.research_publications for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id)
  or exists(select 1 from public.research r where r.id=research_publications.research_id and r.is_public and research_publications.status='published'));
create policy research_publications_manager_write on public.research_publications for all to authenticated
using(public.can_manage_research(research_id)) with check(public.can_manage_research(research_id));

create policy research_documents_scope_read on public.research_documents for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id));
create policy research_documents_manager_write on public.research_documents for all to authenticated
using(public.can_manage_research(research_id)) with check(public.can_manage_research(research_id));

create policy research_document_permissions_scope_read on public.research_document_permissions for select to authenticated
using(public.can_manage_research((select research_id from public.research_documents where id=document_id))
  or user_id=auth.uid() or (role is not null and public.has_role(role)));
create policy research_document_permissions_manager_write on public.research_document_permissions for all to authenticated
using(public.can_manage_research((select research_id from public.research_documents where id=document_id)))
with check(public.can_manage_research((select research_id from public.research_documents where id=document_id)) and granted_by=auth.uid());

create policy research_activity_scope_read on public.research_activity for select to authenticated
using(public.is_admin() or public.is_research_member(research_id) or public.can_manage_research(research_id));

create policy research_tasks_manager_insert on public.tasks for insert to authenticated
with check(research_id is not null and public.can_manage_research(research_id) and created_by=auth.uid());
create policy research_tasks_scope_update on public.tasks for update to authenticated
using(research_id is not null and (public.can_manage_research(research_id) or assignee_id=auth.uid()))
with check(research_id is not null and (public.can_manage_research(research_id) or assignee_id=auth.uid()));
create policy research_tasks_manager_delete on public.tasks for delete to authenticated
using(research_id is not null and public.can_manage_research(research_id));

create or replace function public.can_read_research_document(wanted uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.research_documents d where d.id=wanted and (
    public.can_manage_research(d.research_id) or (not d.restricted and public.is_research_member(d.research_id)) or exists(
      select 1 from public.research_document_permissions dp where dp.document_id=d.id and dp.can_read and
      (dp.user_id=auth.uid() or (dp.role is not null and public.has_role(dp.role)))
    )
  ))
$$;
revoke all on function public.can_read_research_document(uuid) from public,anon; grant execute on function public.can_read_research_document(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('research-files','research-files',false,26214400,array['application/pdf','image/png','image/jpeg','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy research_storage_read on storage.objects for select to authenticated using(bucket_id='research-files' and exists(
  select 1 from public.research_documents d where d.storage_path=name and public.can_read_research_document(d.id)));
create policy research_storage_insert on storage.objects for insert to authenticated with check(bucket_id='research-files' and public.can_manage_research(((storage.foldername(name))[1])::uuid));
create policy research_storage_delete on storage.objects for delete to authenticated using(bucket_id='research-files' and exists(
  select 1 from public.research_documents d where d.storage_path=name and public.can_manage_research(d.research_id)));

create or replace function public.log_research_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare r uuid; rid text; begin
  if tg_table_name='research' then r:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id')::uuid;
  else r:=coalesce(to_jsonb(new)->>'research_id',to_jsonb(old)->>'research_id')::uuid; end if;
  if r is null then return case when tg_op='DELETE' then old else new end; end if;
  rid:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id');
  insert into public.research_activity(research_id,actor_id,action,entity_type,entity_id,details)
  values(r,auth.uid(),tg_op,tg_table_name,rid,jsonb_build_object('status',coalesce(to_jsonb(new)->>'status','')));
  return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare t text; begin foreach t in array array['research','research_members','research_datasets','research_experiments','research_ethics_approvals','research_publications','research_documents','tasks'] loop
  if not exists(select 1 from pg_trigger where tgname='research_activity_'||t) then
    execute format('create trigger research_activity_%I after insert or update or delete on public.%I for each row execute function public.log_research_activity()',t,t);
  end if;
end loop; end $$;

create or replace function public.notify_research_member() returns trigger language plpgsql security definer set search_path='' as $$
declare title text; begin
  select r.title into title from public.research r where r.id=new.research_id;
  insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  values(new.user_id,'research_membership','انضمام إلى بحث','Added to research',title,title,'research',new.research_id);
  return new;
end $$;
create trigger notify_research_member after insert on public.research_members for each row execute function public.notify_research_member();

create or replace function public.notify_research_ethics_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare supervisor uuid; begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','expired') then
    select r.supervisor_id into supervisor from public.research r where r.id=new.research_id;
    if supervisor is not null then
      insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
      values(supervisor,'research_ethics','قرار الموافقة الأخلاقية','Ethics decision',new.title,new.title,'research_ethics',new.id);
    end if;
  end if; return new;
end $$;
create trigger notify_research_ethics_decision after update of status on public.research_ethics_approvals for each row execute function public.notify_research_ethics_decision();

revoke all on function public.notify_research_member() from public,anon,authenticated;
revoke all on function public.notify_research_ethics_decision() from public,anon,authenticated;
revoke all on function public.log_research_activity() from public,anon,authenticated;

do $$ declare t text; begin foreach t in array array['research','research_members','research_datasets','research_experiments','research_ethics_approvals','research_publications','research_documents','research_activity'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
end loop; end $$;
