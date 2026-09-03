-- Department managers may run day-to-day workflows for their direct team.
-- HR documents and account/role controls deliberately remain HR/Admin only.
create or replace function public.is_department_manager(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_account_active() and exists (
    select 1
    from public.profiles employee
    join public.departments department on department.id = employee.department_id
    where employee.id = target_user
      and department.manager_id = auth.uid()
      and department.active
  )
$$;

revoke all on function public.is_department_manager(uuid) from public, anon;
grant execute on function public.is_department_manager(uuid) to authenticated;

drop policy if exists onboarding_scope_read on public.onboarding_items;
create policy onboarding_scope_read on public.onboarding_items for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id));
drop policy if exists onboarding_self_complete on public.onboarding_items;
create policy onboarding_self_complete on public.onboarding_items for update to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id))
with check ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id));
drop policy if exists onboarding_staff_insert on public.onboarding_items;
create policy onboarding_staff_insert on public.onboarding_items for insert to authenticated
with check ((public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id)) and assigned_by = auth.uid());

drop policy if exists calendar_scope_read on public.calendar_events;
create policy calendar_scope_read on public.calendar_events for select to authenticated
using (public.is_account_active() and (visibility = 'company' or user_id = auth.uid() or created_by = auth.uid() or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id)));
drop policy if exists calendar_own_write on public.calendar_events;
create policy calendar_own_write on public.calendar_events for all to authenticated
using (created_by = auth.uid() or public.is_admin() or public.has_role('hr'))
with check (public.is_account_active() and (created_by = auth.uid() or public.is_admin() or public.has_role('hr')) and (user_id is null or user_id = auth.uid() or public.is_department_manager(user_id)));

drop policy if exists employee_kpis_scope_read on public.employee_kpis;
create policy employee_kpis_scope_read on public.employee_kpis for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id));
drop policy if exists employee_kpis_staff_write on public.employee_kpis;
create policy employee_kpis_staff_write on public.employee_kpis for all to authenticated
using (public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id))
with check ((public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id)) and set_by = auth.uid());

drop policy if exists performance_scope_read on public.performance_reviews;
create policy performance_scope_read on public.performance_reviews for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id));
drop policy if exists performance_staff_write on public.performance_reviews;
create policy performance_staff_write on public.performance_reviews for all to authenticated
using (public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id))
with check ((public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id)) and reviewer_id = auth.uid());

drop policy if exists tasks_staff_insert on public.tasks;
create policy tasks_staff_insert on public.tasks for insert to authenticated
with check ((public.is_admin() or public.has_role('hr') or public.is_department_manager(assignee_id)) and created_by = auth.uid());
drop policy if exists tasks_staff_update on public.tasks;
create policy tasks_staff_update on public.tasks for update to authenticated
using (public.is_admin() or public.has_role('hr') or public.is_department_manager(assignee_id))
with check (public.is_admin() or public.has_role('hr') or public.is_department_manager(assignee_id));

drop policy if exists own_timesheets on public.timesheets;
create policy own_timesheets on public.timesheets for select to authenticated
using ((user_id = auth.uid() and public.is_account_active()) or public.is_admin() or public.has_role('hr') or public.is_department_manager(user_id));
create policy timesheets_own_insert on public.timesheets for insert to authenticated
with check (user_id = auth.uid() and public.is_account_active());
create policy timesheets_own_update on public.timesheets for update to authenticated
using (user_id = auth.uid() and public.is_account_active())
with check (user_id = auth.uid() and public.is_account_active());
create policy timesheets_staff_delete on public.timesheets for delete to authenticated
using (public.is_admin() or public.has_role('hr'));
