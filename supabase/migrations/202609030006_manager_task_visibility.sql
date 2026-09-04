-- A department manager must be able to read a direct report's task after
-- creating or updating it. PostgREST applies SELECT RLS to returned rows.
drop policy if exists task_scope_read on public.tasks;
create policy task_scope_read on public.tasks for select to authenticated
using (
  public.is_admin()
  or (
    public.is_account_active()
    and (
      assignee_id = auth.uid()
      or public.has_role('hr')
      or public.is_department_manager(assignee_id)
      or exists (
        select 1 from public.project_members member
        where member.project_id = tasks.project_id
          and member.user_id = auth.uid()
      )
      or exists (
        select 1 from public.research_members member
        where member.research_id = tasks.research_id
          and member.user_id = auth.uid()
      )
    )
  )
);
