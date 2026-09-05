-- Temporary free-tier guardrails. Keep public website chat and authenticated
-- company agents on separate Gemini model quotas, leaving a small daily reserve.
alter table public.llm_providers
  add column if not exists requests_per_day int not null default 18
  check (requests_per_day > 0);

update public.llm_providers
set chat_model = 'gemini-3.8-flash',
    requests_per_hour = 5,
    requests_per_day = 18,
    notes = coalesce(notes, '') || ' Free-tier guardrail: 3.8 for company agents, maximum 5/hour and 18/rolling-24h.'
where id = 'gemini';

update public.agents a
set model = p.chat_model, updated_at = now()
from public.llm_providers p
where a.provider_id = p.id and p.id = 'gemini';

create table if not exists public.public_assistant_daily_usage (
  usage_day date primary key default (now() at time zone 'utc')::date,
  request_count int not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.public_assistant_daily_usage enable row level security;
revoke all on public.public_assistant_daily_usage from anon, authenticated;

create or replace function public.consume_public_assistant_quota(daily_limit int default 18)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  used int;
begin
  if daily_limit < 1 then return false; end if;
  insert into public.public_assistant_daily_usage(usage_day, request_count)
  values (today, 1)
  on conflict (usage_day) do update
    set request_count = public.public_assistant_daily_usage.request_count + 1,
        updated_at = now()
    where public.public_assistant_daily_usage.request_count < daily_limit
  returning request_count into used;
  return used is not null and used <= daily_limit;
end;
$$;

revoke all on function public.consume_public_assistant_quota(int) from public, anon, authenticated;
grant execute on function public.consume_public_assistant_quota(int) to service_role;
