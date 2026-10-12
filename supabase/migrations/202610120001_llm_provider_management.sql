begin;

alter table public.llm_providers
  add column api_style text not null default 'google_gemini'
    check (api_style in ('google_gemini','openai_compatible','ollama')),
  add column model_mode text not null default 'fixed'
    check (model_mode in ('fixed','auto')),
  add column last_model_resolved_at timestamptz,
  add column api_key_secret_id uuid,
  add column last_tested_at timestamptz,
  add column last_test_status text not null default 'untested'
    check (last_test_status in ('untested','success','failed')),
  add column last_test_latency_ms integer check (last_test_latency_ms is null or last_test_latency_ms between 0 and 300000),
  add column last_test_error text check (last_test_error is null or length(last_test_error) <= 160),
  add column archived_at timestamptz,
  add column updated_at timestamptz not null default now();

-- Keep the provider ledger useful for both local and external models. Older
-- runs retain their total in token_usage; new runs also record the split the
-- provider returns, so the Owner can see input versus generated output.
alter table public.agent_runs
  add column prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  add column completion_tokens integer check (completion_tokens is null or completion_tokens >= 0);

create table public.llm_provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.llm_providers(id),
  source text not null default 'service' check (source ~ '^[a-z0-9_-]{2,40}$'),
  succeeded boolean not null,
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 300000),
  created_at timestamptz not null default now()
);
create index llm_provider_usage_events_recent on public.llm_provider_usage_events(provider_id,created_at desc);
alter table public.llm_provider_usage_events enable row level security;
revoke all on public.llm_provider_usage_events from public,anon,authenticated;
grant select,insert on public.llm_provider_usage_events to service_role;

update public.llm_providers set api_style='ollama' where kind='local';
update public.llm_providers set api_style='google_gemini' where id='gemini';
-- The local runtime was verified directly over its restricted SSH tunnel for
-- this release. Preserve its active state while all other legacy connections
-- still have to pass the new explicit test before being enabled again.
update public.llm_providers
set last_tested_at=now(),last_test_status='success',last_test_latency_ms=0,last_test_error=null
where id='ollama' and enabled;
update public.llm_providers set enabled=false where enabled and last_test_status<>'success';

alter table public.llm_providers
  add constraint llm_providers_id_safe check (id ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  add constraint llm_providers_name_bounded check (length(name) between 2 and 100),
  add constraint llm_providers_endpoint_bounded check (length(endpoint) between 8 and 500),
  add constraint llm_providers_chat_model_bounded check (length(chat_model) between 1 and 160),
  add constraint llm_providers_embedding_model_bounded check (embedding_model is null or length(embedding_model) between 1 and 160),
  add constraint llm_providers_external_https check (kind='local' or endpoint ~ '^https://'),
  add constraint llm_providers_test_shape check (
    (last_test_status='success' and last_tested_at is not null and last_test_latency_ms is not null and last_test_error is null)
    or (last_test_status='failed' and last_tested_at is not null and last_test_error is not null)
    or (last_test_status='untested' and last_tested_at is null and last_test_latency_ms is null and last_test_error is null)
  );

-- Provider configuration and Vault pointers are changed only by the Owner-only
-- host API. Authenticated clients keep read access through the existing policy,
-- but cannot point a provider at an unrelated Vault secret or bypass testing.
drop policy if exists providers_owner_write on public.llm_providers;
revoke all privileges on public.llm_providers from public,anon,authenticated;
grant select (
  id,name,kind,endpoint,chat_model,embedding_model,max_classification,retains_data,enabled,requests_per_hour,requests_per_day,notes,created_at,
  api_style,model_mode,last_model_resolved_at,last_tested_at,last_test_status,last_test_latency_ms,last_test_error,archived_at,updated_at
) on public.llm_providers to authenticated;

create or replace function public.store_llm_provider_secret(target_provider text, new_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare existing_id uuid; stored_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if new_secret is null or length(new_secret) < 8 or length(new_secret) > 4096 then raise exception 'invalid_provider_secret'; end if;
  select api_key_secret_id into existing_id from public.llm_providers where id=target_provider for update;
  if not found then raise exception 'provider_not_found'; end if;
  if existing_id is null then
    stored_id := vault.create_secret(new_secret,'reid_llm_'||target_provider,'Reid LLM provider credential');
    update public.llm_providers set api_key_secret_id=stored_id,updated_at=now() where id=target_provider;
  else
    perform vault.update_secret(existing_id,new_secret,'reid_llm_'||target_provider,'Reid LLM provider credential');
    stored_id := existing_id;
  end if;
  return stored_id;
end
$$;

create or replace function public.read_llm_provider_secret(target_provider text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare value text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select secret.decrypted_secret into value
  from public.llm_providers provider
  join vault.decrypted_secrets secret on secret.id=provider.api_key_secret_id
  where provider.id=target_provider;
  return value;
end
$$;

create or replace function public.delete_llm_provider_secret(target_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare secret_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select api_key_secret_id into secret_id from public.llm_providers where id=target_provider for update;
  update public.llm_providers set api_key_secret_id=null,updated_at=now() where id=target_provider;
  if secret_id is not null then delete from vault.secrets where id=secret_id; end if;
end
$$;

revoke all on function public.store_llm_provider_secret(text,text) from public,anon,authenticated;
revoke all on function public.read_llm_provider_secret(text) from public,anon,authenticated;
revoke all on function public.delete_llm_provider_secret(text) from public,anon,authenticated;
grant execute on function public.store_llm_provider_secret(text,text) to service_role;
grant execute on function public.read_llm_provider_secret(text) to service_role;
grant execute on function public.delete_llm_provider_secret(text) to service_role;

create or replace function public.llm_provider_usage()
returns table (
  provider_id text,
  requests_24h bigint,
  tokens_24h bigint,
  requests_30d bigint,
  succeeded_30d bigint,
  failed_30d bigint,
  prompt_tokens_30d bigint,
  completion_tokens_30d bigint,
  total_tokens_30d bigint,
  average_latency_ms_30d integer,
  requests_total bigint,
  total_tokens_total bigint,
  last_used_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  return query
  with activity as (
    select run.provider_id,run.created_at,run.run_state='succeeded' as succeeded,run.run_state='failed' as failed,
      run.prompt_tokens,run.completion_tokens,run.token_usage as total_tokens,run.latency_ms
    from public.agent_runs run where run.provider_id is not null
    union all
    select event.provider_id,event.created_at,event.succeeded,not event.succeeded,
      event.prompt_tokens,event.completion_tokens,event.total_tokens,event.latency_ms
    from public.llm_provider_usage_events event
  )
  select
    activity.provider_id,
    count(*) filter (where activity.created_at >= now() - interval '24 hours'),
    coalesce(sum(activity.total_tokens) filter (where activity.created_at >= now() - interval '24 hours'),0)::bigint,
    count(*) filter (where activity.created_at >= now() - interval '30 days'),
    count(*) filter (where activity.created_at >= now() - interval '30 days' and activity.succeeded),
    count(*) filter (where activity.created_at >= now() - interval '30 days' and activity.failed),
    coalesce(sum(activity.prompt_tokens) filter (where activity.created_at >= now() - interval '30 days'),0)::bigint,
    coalesce(sum(activity.completion_tokens) filter (where activity.created_at >= now() - interval '30 days'),0)::bigint,
    coalesce(sum(activity.total_tokens) filter (where activity.created_at >= now() - interval '30 days'),0)::bigint,
    round(avg(activity.latency_ms) filter (where activity.created_at >= now() - interval '30 days' and activity.latency_ms is not null))::integer,
    count(*),
    coalesce(sum(activity.total_tokens),0)::bigint,
    max(activity.created_at)
  from activity
  group by activity.provider_id;
end
$$;

revoke all on function public.llm_provider_usage() from public,anon,authenticated;
grant execute on function public.llm_provider_usage() to service_role;

comment on column public.llm_providers.api_key_secret_id is 'Opaque pointer to a Supabase Vault secret. Never selected by the browser.';
comment on column public.llm_providers.api_style is 'Request protocol used by the governed gateway: Gemini, OpenAI-compatible, or Ollama.';
comment on function public.llm_provider_usage() is 'Service-only aggregate usage ledger used by the Owner LLM dashboard; it returns no prompts or model output.';
comment on table public.llm_provider_usage_events is 'Content-free usage telemetry for direct host model calls outside agent_runs.';

commit;
