create table public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  website text,
  phone text,
  email text,
  address text,
  owner_id uuid references public.profiles,
  status text not null default 'prospect' check (status in ('prospect','active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_contacts
  add column company_id uuid references public.crm_companies on delete set null,
  add column position text,
  add column source text,
  add column notes text,
  add column updated_at timestamptz not null default now();

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_id uuid references public.crm_companies on delete set null,
  contact_id uuid references public.crm_contacts on delete set null,
  owner_id uuid references public.profiles,
  source text,
  stage text not null default 'new' check (stage in ('new','qualified','proposal','negotiation','converted','lost')),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  probability int not null default 10 check (probability between 0 and 100),
  next_follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_id uuid references public.crm_companies on delete set null,
  contact_id uuid references public.crm_contacts on delete set null,
  lead_id uuid references public.crm_leads on delete set null,
  owner_id uuid references public.profiles,
  stage text not null default 'discovery' check (stage in ('discovery','proposal','negotiation','won','lost')),
  value numeric(14,2) not null default 0 check (value >= 0),
  currency text not null default 'OMR' check (currency in ('OMR','USD','AED','EUR')),
  expected_close_date date,
  closed_at timestamptz,
  loss_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage <> 'lost' or nullif(trim(loss_reason), '') is not null)
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null check (activity_type in ('call','email','meeting','note','task')),
  subject text not null,
  company_id uuid references public.crm_companies on delete cascade,
  contact_id uuid references public.crm_contacts on delete cascade,
  lead_id uuid references public.crm_leads on delete cascade,
  deal_id uuid references public.crm_deals on delete cascade,
  owner_id uuid references public.profiles,
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles,
  created_at timestamptz not null default now(),
  check (num_nonnulls(company_id, contact_id, lead_id, deal_id) > 0)
);

create table public.executive_reports (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period in ('daily','weekly')),
  period_start date not null,
  period_end date not null,
  metrics jsonb not null default '{}',
  highlights jsonb not null default '[]',
  generated_by uuid references public.profiles,
  generated_at timestamptz not null default now(),
  email_status text not null default 'not_requested' check (email_status in ('not_requested','pending','sent','failed')),
  email_error text,
  unique (period, period_start, period_end)
);

create or replace function public.crm_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.has_role('hr') or public.has_role('sales')
$$;

create or replace function public.executive_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.has_role('hr')
$$;

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
      'open_pipeline_value', (select coalesce(sum(value),0) from public.crm_deals where stage not in ('won','lost')),
      'won_value', (select coalesce(sum(value),0) from public.crm_deals where stage = 'won' and coalesce(closed_at,updated_at)::date between report_start and requested_end),
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

alter table public.crm_companies enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_activities enable row level security;
alter table public.executive_reports enable row level security;

drop policy if exists crm_staff on public.crm_contacts;
create policy crm_contacts_staff on public.crm_contacts for all to authenticated
  using (public.crm_access()) with check (public.crm_access());
create policy crm_companies_staff on public.crm_companies for all to authenticated
  using (public.crm_access()) with check (public.crm_access());
create policy crm_leads_staff on public.crm_leads for all to authenticated
  using (public.crm_access()) with check (public.crm_access());
create policy crm_deals_staff on public.crm_deals for all to authenticated
  using (public.crm_access()) with check (public.crm_access());
create policy crm_activities_staff on public.crm_activities for all to authenticated
  using (public.crm_access()) with check (public.crm_access());
create policy executive_reports_read on public.executive_reports for select to authenticated
  using (public.executive_access());
create policy executive_reports_admin_write on public.executive_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['crm_companies','crm_leads','crm_deals','crm_activities','executive_reports'] loop
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

alter publication supabase_realtime add table public.crm_companies, public.crm_contacts, public.crm_leads, public.crm_deals, public.crm_activities, public.executive_reports;

grant execute on function public.crm_access() to authenticated;
grant execute on function public.executive_access() to authenticated;
grant execute on function public.generate_executive_report(text,date) to authenticated, service_role;
