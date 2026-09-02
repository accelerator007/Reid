-- Account lifecycle, suspension enforcement, and function-only role mutation.

create table if not exists public.account_controls (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
  reason text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

insert into public.account_controls(user_id, status)
select id, 'active' from public.profiles
on conflict (user_id) do nothing;

alter table public.account_controls enable row level security;
create policy account_controls_read on public.account_controls for select to authenticated
using (user_id = auth.uid() or public.is_admin() or public.has_role('hr'));

create trigger audit_account_controls after insert or update or delete on public.account_controls
for each row execute function public.audit_row();

create or replace function public.is_account_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_controls
    where user_id = auth.uid() and status = 'active'
  )
$$;

revoke all on function public.is_account_active() from public, anon;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.has_role(wanted public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_account_active() and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = wanted
  )
$$;

drop policy if exists roles_owner_write on public.user_roles;

drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles for update to authenticated
using ((id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'))
with check ((id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'));

drop policy if exists own_timesheets on public.timesheets;
create policy own_timesheets on public.timesheets for all to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr'))
with check ((user_id = auth.uid() and public.is_account_active()) or public.is_admin());

drop policy if exists project_member_read on public.projects;
create policy project_member_read on public.projects for select to authenticated
using (public.is_admin() or (public.is_account_active() and exists (
  select 1 from public.project_members m where m.project_id = id and m.user_id = auth.uid()
)));

drop policy if exists research_visibility on public.research;
create policy research_visibility on public.research for select to authenticated
using (is_public or public.is_admin() or (public.is_account_active() and exists (
  select 1 from public.research_members m where m.research_id = id and m.user_id = auth.uid()
)));

drop policy if exists task_scope_read on public.tasks;
create policy task_scope_read on public.tasks for select to authenticated
using (public.is_admin() or (public.is_account_active() and (
  assignee_id = auth.uid()
  or exists(select 1 from public.project_members m where m.project_id = tasks.project_id and m.user_id = auth.uid())
  or exists(select 1 from public.research_members m where m.research_id = tasks.research_id and m.user_id = auth.uid())
)));

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin());

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id = auth.uid() and public.is_account_active())
with check (user_id = auth.uid() and public.is_account_active());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email, linkedin_url, github_url, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'linkedin_url', ''),
    nullif(new.raw_user_meta_data->>'github_url', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();
  insert into public.account_controls(user_id, status) values(new.id, 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
