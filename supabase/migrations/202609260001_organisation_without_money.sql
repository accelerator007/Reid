-- Reid is run as an organising workspace without money (Owner decision,
-- 2026-09-26). Historical finance rows are kept untouched for audit; this
-- migration only stops agents and reports from reading or changing them.

update public.agents
set enabled = false,
    status = 'disabled',
    disabled_reason = 'Retired by the Owner on 2026-09-26: Reid no longer manages money in the workspace.'
where id = 'finance';

update public.agent_tools
set enabled = false, updated_at = now()
where id in ('finance.budgets', 'projects.budget.update');

delete from public.agent_tool_assignments
where tool_id in ('finance.budgets', 'projects.budget.update');

-- Same report, counted instead of valued: deal counts replace pipeline and
-- won-deal sums.
create or replace function public.generate_executive_report(
  requested_period text,
  requested_end date default current_date
) returns public.executive_reports
language plpgsql security definer set search_path = '' as $$
declare
  report_start date;
  result public.executive_reports;
begin
  if requested_period not in ('daily','weekly') then raise exception 'invalid_report_period'; end if;
  if auth.role() <> 'service_role' and not public.executive_access() then raise exception 'report_access_denied'; end if;
  report_start := case when requested_period = 'daily' then requested_end else requested_end - 6 end;

  insert into public.executive_reports(period, period_start, period_end, metrics, highlights, generated_by)
  values (
    requested_period,
    report_start,
    requested_end,
    jsonb_build_object(
      'active_projects', (select count(*) from public.projects where status = 'active' and archived_at is null),
      'open_tasks', (select count(*) from public.tasks where status not in ('done','completed')),
      'employees', (select count(distinct user_id) from public.user_roles where role = 'employee'),
      'new_leads', (select count(*) from public.crm_leads where created_at::date between report_start and requested_end),
      'open_deals', (select count(*) from public.crm_deals where stage not in ('won','lost')),
      'won_deals', (select count(*) from public.crm_deals where stage = 'won' and coalesce(closed_at,updated_at)::date between report_start and requested_end),
      'pending_applications', (select count(*) from public.applications where status = 'pending'),
      'agent_failures', (select count(*) from public.agent_runs where status = 'failed' and created_at::date between report_start and requested_end)
    ),
    jsonb_build_array(
      jsonb_build_object('kind','follow_ups_due','count',(select count(*) from public.crm_leads where next_follow_up_at < now() and stage not in ('converted','lost'))),
      jsonb_build_object('kind','deals_closing','count',(select count(*) from public.crm_deals where expected_close_date between current_date and current_date + 14 and stage not in ('won','lost')))
    ),
    auth.uid()
  )
  on conflict (period, period_start, period_end) do update set
    metrics = excluded.metrics,
    highlights = excluded.highlights,
    generated_by = excluded.generated_by,
    generated_at = now()
  returning * into result;
  return result;
end
$$;
