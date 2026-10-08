begin;

create function public.owner_company_snapshot()
returns jsonb
language plpgsql security definer set search_path='' as $$
declare metrics jsonb; alerts jsonb; stages jsonb; cash_trend jsonb; receivables jsonb; attention_projects jsonb;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'owner_snapshot_denied'; end if;

  select jsonb_build_object(
    'active_people',(select count(distinct roles.user_id) from public.user_roles roles join public.account_controls controls on controls.user_id=roles.user_id and controls.status='active' where roles.role<>'guest'),
    'active_projects',(select count(*) from public.projects where status='active' and archived_at is null),
    'active_cases',(select count(*) from public.business_cases where stage not in ('closed','cancelled')),
    'pipeline_omr',(select coalesce(sum(value),0) from public.business_cases where currency='OMR' and stage not in ('closed','cancelled')),
    'outstanding_omr',(select coalesce(sum(amount-paid_amount),0) from public.finance_documents where kind='invoice' and currency='OMR' and status not in ('paid','void')),
    'collected_30d_omr',(select coalesce(sum(amount),0) from public.finance_payments where currency='OMR' and status='posted' and paid_on>=current_date-29),
    'issued_30d_omr',(select coalesce(sum(amount),0) from public.finance_documents where kind='invoice' and currency='OMR' and status<>'void' and issued_at>=now()-interval '30 days')
  ) into metrics;

  select jsonb_build_object(
    'overdue_invoices',(select count(*) from public.finance_documents where kind='invoice' and status not in ('paid','void') and due_date<current_date),
    'overdue_amount_omr',(select coalesce(sum(amount-paid_amount),0) from public.finance_documents where kind='invoice' and currency='OMR' and status not in ('paid','void') and due_date<current_date),
    'overdue_tasks',(select count(*) from public.tasks where status not in ('done','completed') and due_at<now()),
    'pending_approvals',(select count(*) from public.agent_runs where approval_state='pending'),
    'pending_applications',(select count(*) from public.applications where status='pending'),
    'stalled_cases',(select count(*) from public.business_cases where stage not in ('closed','cancelled','collected') and updated_at<now()-interval '14 days'),
    'failed_agent_runs_7d',(select count(*) from public.agent_runs where run_state='failed' and created_at>=now()-interval '7 days')
  ) into alerts;

  select coalesce(jsonb_agg(jsonb_build_object('stage',rows.stage,'count',rows.count,'value_omr',rows.value_omr) order by rows.stage),'[]'::jsonb)
  into stages from (
    select stage,count(*)::int as count,coalesce(sum(value) filter(where currency='OMR'),0) as value_omr
    from public.business_cases group by stage
  ) rows;

  select coalesce(jsonb_agg(jsonb_build_object('month',rows.month,'collected_omr',rows.collected_omr) order by rows.month),'[]'::jsonb)
  into cash_trend from (
    select to_char(months.month_start,'YYYY-MM') as month,coalesce(sum(payments.amount) filter(where payments.currency='OMR' and payments.status='posted'),0) as collected_omr
    from generate_series(date_trunc('month',current_date)-interval '5 months',date_trunc('month',current_date),interval '1 month') months(month_start)
    left join public.finance_payments payments on payments.paid_on>=months.month_start::date and payments.paid_on<(months.month_start+interval '1 month')::date
    group by months.month_start
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.is_overdue desc,rows.due_date nulls last,rows.number),'[]'::jsonb)
  into receivables from (
    select id,number,counterparty,due_date,currency,amount,paid_amount,(amount-paid_amount) as balance,(due_date<current_date) as is_overdue
    from public.finance_documents
    where kind='invoice' and status not in ('paid','void')
    order by (due_date<current_date) desc,due_date nulls last,number
    limit 8
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.risk_count desc,rows.overdue_tasks desc,rows.target_date nulls last),'[]'::jsonb)
  into attention_projects from (
    select project.id,project.name,project.status,project.target_date,
      (select count(*) from public.tasks task where task.project_id=project.id and task.status not in ('done','completed') and task.due_at<now())::int as overdue_tasks,
      (select count(*) from public.project_kpis kpi where kpi.project_id=project.id and kpi.status='at_risk')::int as risk_count
    from public.projects project
    where project.status='active' and project.archived_at is null
    order by 6 desc,5 desc,project.target_date nulls last
    limit 8
  ) rows;

  return jsonb_build_object('as_of',now(),'currency','OMR','metrics',metrics,'alerts',alerts,'stages',stages,'cash_trend',cash_trend,'receivables',receivables,'projects',attention_projects);
end $$;

revoke all on function public.owner_company_snapshot() from public,anon;
grant execute on function public.owner_company_snapshot() to authenticated;

commit;
