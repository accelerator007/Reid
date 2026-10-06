create table public.service_health_snapshots (
  id text primary key check (id = 'production'),
  checked_at timestamptz not null,
  ok boolean not null,
  components jsonb not null check (jsonb_typeof(components) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.service_health_snapshots enable row level security;

revoke all on table public.service_health_snapshots from anon, authenticated;

create or replace function public.reid_public_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when snapshot.id is null then jsonb_build_object(
      'ok', false,
      'components', jsonb_build_object(
        'website', false,
        'database', false,
        'whatsapp', false,
        'aiLap', false,
        'tts', false,
        'queues', false
      ),
      'checkedAt', null
    )
    when snapshot.checked_at < now() - interval '10 minutes' then jsonb_build_object(
      'ok', false,
      'components', jsonb_build_object(
        'website', false,
        'database', false,
        'whatsapp', false,
        'aiLap', false,
        'tts', false,
        'queues', false
      ),
      'checkedAt', snapshot.checked_at
    )
    else jsonb_build_object(
      'ok', snapshot.ok,
      'components', snapshot.components,
      'checkedAt', snapshot.checked_at
    )
  end
  from (select 1) seed
  left join public.service_health_snapshots snapshot on snapshot.id = 'production';
$$;

revoke all on function public.reid_public_health() from public;
grant execute on function public.reid_public_health() to anon, authenticated;

comment on table public.service_health_snapshots is
  'Service-role-only heartbeat used by external monitoring when Cloudflare challenges the primary health route.';
comment on function public.reid_public_health() is
  'Returns only bounded component booleans and automatically fails closed when the production heartbeat is stale.';
