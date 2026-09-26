begin;

-- Web access is a governed tool like every other one, not an open socket. The
-- grounded search that already exists only runs on the Gemini branch, which the
-- Ollama-primary decision made unreachable, and the WhatsApp assistant never
-- went through the gateway at all.
insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema) values
  ('web.search','بحث في الويب','Search the web','Search the public web and return titles, links and snippets with their source.','read',0,
   '{"required":["query"],"properties":{"query":{"type":"string"},"count":{"type":"integer"}}}'),
  ('web.read','قراءة صفحة','Read a web page','Fetch one public https page and return its readable text.','read',0,
   '{"required":["url"],"properties":{"url":{"type":"string"}}}')
on conflict (id) do update set
  name_ar=excluded.name_ar, name_en=excluded.name_en, description=excluded.description,
  operation=excluded.operation, approval_level=excluded.approval_level,
  input_schema=excluded.input_schema, updated_at=now();

insert into public.agent_tool_assignments(agent_id,tool_id)
select agent.id, tool.id
  from public.agents agent
 cross join (values ('web.search'),('web.read')) as tool(id)
 where agent.id in ('knowledge','competitor','marketing','content','support')
on conflict do nothing;

-- Same shape as the public assistant quota and the image budget: an atomic
-- consume, and a release for a call that never happened.
create table if not exists public.web_search_usage (
  usage_day date primary key default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.web_search_usage enable row level security;
revoke all on public.web_search_usage from anon, authenticated;
grant select on public.web_search_usage to authenticated;
grant all on public.web_search_usage to service_role;
create policy web_search_usage_owner_read on public.web_search_usage
  for select to authenticated using (public.has_role('owner') or public.has_role('super_admin'));

create or replace function public.consume_web_search_quota(daily_limit integer default 60)
returns boolean language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if daily_limit < 1 or daily_limit > 10000 then raise exception 'invalid_web_search_limit'; end if;
  insert into public.web_search_usage(usage_day, request_count)
       values ((now() at time zone 'utc')::date, 1)
  on conflict (usage_day) do update
      set request_count = public.web_search_usage.request_count + 1, updated_at = now()
    where public.web_search_usage.request_count < daily_limit
  returning request_count into used;
  return used is not null;
end $$;

create or replace function public.release_web_search_quota()
returns integer language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  update public.web_search_usage
     set request_count = greatest(request_count - 1, 0), updated_at = now()
   where usage_day = (now() at time zone 'utc')::date
  returning request_count into used;
  return coalesce(used, 0);
end $$;

revoke all on function public.consume_web_search_quota(integer) from public, anon, authenticated;
revoke all on function public.release_web_search_quota() from public, anon, authenticated;
grant execute on function public.consume_web_search_quota(integer) to service_role;
grant execute on function public.release_web_search_quota() to service_role;

comment on table public.web_search_usage is
  'Daily counter for outbound web searches. Consumed atomically before a call and released when the call never happened.';

commit;
