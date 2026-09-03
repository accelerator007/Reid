-- Employee workspace: directory, onboarding, calendar, announcements, documents,
-- performance, timesheets, audit, realtime, and private storage.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description text,
  manager_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(name_ar), unique(name_en)
);

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists hire_date date,
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('active','onboarding','leave','inactive'));

create table if not exists public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_ar text not null,
  title_en text not null,
  due_date date,
  sort_order int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (completed = (completed_at is not null))
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  visibility text not null default 'private' check (visibility in ('private','company')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  audience_role public.app_role,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('general','contract','certificate','policy','onboarding')),
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  target_value numeric not null,
  current_value numeric not null default 0,
  unit text not null default '%',
  period_start date not null,
  period_end date not null,
  status text not null default 'on_track' check (status in ('on_track','at_risk','achieved')),
  set_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  rating numeric(2,1) not null check (rating between 1 and 5),
  summary text not null,
  strengths text,
  improvements text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

do $$ declare t text; begin
  foreach t in array array['departments','onboarding_items','calendar_events','announcements','employee_documents','employee_kpis','performance_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_trigger where tgname = 'audit_' || t) then
      execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
    end if;
  end loop;
end $$;

create policy departments_company_read on public.departments for select to authenticated
using (public.is_account_active());
create policy departments_staff_write on public.departments for all to authenticated
using (public.is_admin() or public.has_role('hr'))
with check (public.is_admin() or public.has_role('hr'));

create policy profiles_company_directory on public.profiles for select to authenticated
using (public.is_account_active());

create policy onboarding_scope_read on public.onboarding_items for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));
create policy onboarding_self_complete on public.onboarding_items for update to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'))
with check ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));
create policy onboarding_staff_insert on public.onboarding_items for insert to authenticated
with check ((public.is_admin() or public.has_role('hr')) and assigned_by = auth.uid());
create policy onboarding_staff_delete on public.onboarding_items for delete to authenticated
using (public.is_admin() or public.has_role('hr'));

create policy calendar_scope_read on public.calendar_events for select to authenticated
using (public.is_account_active() and (visibility = 'company' or user_id = auth.uid() or created_by = auth.uid() or public.is_admin() or public.has_role('hr')));
create policy calendar_own_write on public.calendar_events for all to authenticated
using (created_by = auth.uid() or public.is_admin() or public.has_role('hr'))
with check (public.is_account_active() and (created_by = auth.uid() or public.is_admin() or public.has_role('hr')));

create policy announcements_company_read on public.announcements for select to authenticated
using (public.is_account_active() and (expires_at is null or expires_at > now()) and (audience_role is null or public.has_role(audience_role)));
create policy announcements_staff_write on public.announcements for all to authenticated
using (public.is_admin() or public.has_role('hr'))
with check ((public.is_admin() or public.has_role('hr')) and created_by = auth.uid());

create policy employee_documents_scope_read on public.employee_documents for select to authenticated
using ((owner_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));
create policy employee_documents_scope_insert on public.employee_documents for insert to authenticated
with check (((owner_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr')) and uploaded_by = auth.uid());
create policy employee_documents_scope_delete on public.employee_documents for delete to authenticated
using (owner_id = auth.uid() or public.is_admin() or public.has_role('hr'));

create policy employee_kpis_scope_read on public.employee_kpis for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));
create policy employee_kpis_staff_write on public.employee_kpis for all to authenticated
using (public.is_admin() or public.has_role('hr'))
with check ((public.is_admin() or public.has_role('hr')) and set_by = auth.uid());

create policy performance_scope_read on public.performance_reviews for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));
create policy performance_staff_write on public.performance_reviews for all to authenticated
using (public.is_admin() or public.has_role('hr'))
with check ((public.is_admin() or public.has_role('hr')) and reviewer_id = auth.uid());

create policy tasks_staff_insert on public.tasks for insert to authenticated
with check ((public.is_admin() or public.has_role('hr')) and created_by = auth.uid());
create policy tasks_staff_update on public.tasks for update to authenticated
using (public.is_admin() or public.has_role('hr'))
with check (public.is_admin() or public.has_role('hr'));
create policy tasks_assignee_update on public.tasks for update to authenticated
using (assignee_id = auth.uid() and public.is_account_active())
with check (assignee_id = auth.uid() and public.is_account_active());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 10485760,
  array['application/pdf','image/png','image/jpeg','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy employee_files_scope_read on storage.objects for select to authenticated
using (bucket_id = 'employee-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.has_role('hr')));
create policy employee_files_scope_insert on storage.objects for insert to authenticated
with check (bucket_id = 'employee-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.has_role('hr')));
create policy employee_files_scope_delete on storage.objects for delete to authenticated
using (bucket_id = 'employee-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.has_role('hr')));

do $$ declare t text; begin
  foreach t in array array['onboarding_items','calendar_events','announcements','employee_kpis','tasks','timesheets','notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

insert into public.departments(name_ar,name_en,description) values
('الإدارة','Executive','قيادة الشركة والحوكمة'),
('التقنية','Technology','المنتجات والهندسة والذكاء الاصطناعي'),
('الموارد البشرية','People','الموظفون والثقافة والعمليات'),
('المبيعات','Sales','العملاء والمبيعات والشراكات'),
('الأبحاث','Research','الأبحاث والتجارب والمنشورات')
on conflict do nothing;
