-- Secure V1 onboarding, CV storage, application decisions, and realtime feeds.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-cvs', 'application-cvs', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy application_cv_public_upload
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'application-cvs'
  and storage.extension(name) = 'pdf'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
);

create policy application_cv_hr_read
on storage.objects for select to authenticated
using (
  bucket_id = 'application-cvs'
  and (public.is_admin() or public.has_role('hr'))
);

create policy application_cv_failed_submit_cleanup
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'application-cvs'
  and created_at > now() - interval '10 minutes'
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  kind text not null,
  title_ar text not null,
  title_en text not null,
  body_ar text,
  body_en text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select to authenticated
using (user_id = auth.uid() or public.is_admin());
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger audit_notifications after insert or update or delete on public.notifications
for each row execute function public.audit_row();

create or replace function public.notify_application_reviewers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, kind, title_ar, title_en, body_ar, body_en, entity_type, entity_id)
  select distinct ur.user_id, 'application_received', 'طلب انضمام جديد', 'New join application',
    'وصل طلب جديد من ' || new.full_name, 'A new application arrived from ' || new.full_name,
    'application', new.id from public.user_roles ur
  where ur.role in ('owner', 'super_admin', 'admin', 'hr');
  return new;
end;
$$;
create trigger notify_application_reviewers after insert on public.applications
for each row execute function public.notify_application_reviewers();

create or replace function public.grant_bootstrap_company_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) = 'alialajmi524@gmail.com' then
    insert into public.user_roles(user_id, role, granted_by) values(new.id, 'owner', new.id)
    on conflict do nothing;
  elsif lower(new.email) = 'sheikhaalmamari4@gmail.com' then
    insert into public.user_roles(user_id, role) values(new.id, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger grant_bootstrap_company_role after insert on public.profiles
for each row execute function public.grant_bootstrap_company_role();

create or replace function public.decide_application(
  application_id uuid,
  decision public.application_status,
  rejection_reason text default null
) returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  decided public.applications;
begin
  if not (public.is_admin() or public.has_role('hr')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'rejected' and nullif(trim(rejection_reason), '') is null then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  update public.applications
     set status = decision,
         internal_rejection_reason = case when decision = 'rejected' then trim(rejection_reason) else null end,
         decided_by = auth.uid(),
         decided_at = now()
   where id = application_id
     and status = 'pending'
  returning * into decided;

  if decided.id is null then
    raise exception 'application_already_decided' using errcode = '40001';
  end if;
  return decided;
end;
$$;

revoke all on function public.decide_application(uuid, public.application_status, text) from public;
grant execute on function public.decide_application(uuid, public.application_status, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'applications'
  ) then alter publication supabase_realtime add table public.applications; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then alter publication supabase_realtime add table public.tasks; end if;
end $$;
