-- Local-only Supabase shim.
--
-- It recreates the minimum of the hosted Supabase platform that the Reid
-- migrations depend on (auth schema, JWT-backed auth.uid(), the anon /
-- authenticated / service_role Postgres roles, the storage schema and the
-- supabase_realtime publication) so the real migrations, and therefore the real
-- RLS policies, can be applied and exercised on a throwaway PostgreSQL 16
-- instance without Docker, Supabase credentials or network access.
--
-- It is never applied to Staging or Production. Nothing here weakens a policy:
-- every policy under test is the verbatim policy from supabase/migrations.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

-- pgvector is not installable in the harness image. `memories.embedding` is the
-- only consumer and no RLS policy reads it, so a shim domain keeps the real
-- migration text runnable. Production uses the genuine extension.
create domain extensions.vector as text;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb)
$$;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null, owner uuid, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), unique (bucket_id, name)
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
  select lower(split_part(name, '.', array_length(string_to_array(name, '.'), 1)))
$$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

-- Impersonation helpers used by the allow/deny suites.
create or replace function public.test_sign_in(actor uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function public.test_sign_out() returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

-- Assertion helpers. Every check records a row; a suite fails loudly if any
-- expectation was not met.
create table if not exists public.test_results (
  id bigint generated always as identity primary key,
  suite text not null, label text not null, ok boolean not null, detail text
);

create or replace function public.t_record(suite text, label text, ok boolean, detail text default null)
returns void language plpgsql as $$ begin
  insert into public.test_results(suite, label, ok, detail) values (suite, label, ok, detail);
  raise notice '%  %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

-- Reads `query` as the current role and asserts the visible row count.
create or replace function public.t_visible(suite text, label text, query text, expected bigint)
returns void language plpgsql as $$ declare got bigint; begin
  execute format('select count(*) from (%s) s', query) into got;
  -- A null expectation means "at least one row" for feeds whose exact size is
  -- an implementation detail.
  perform public.t_record(suite, label,
    case when expected is null then got > 0 else got = expected end,
    format('expected %s rows, got %s', coalesce(expected::text, '>0'), got));
exception when others then
  perform public.t_record(suite, label, false, format('unexpected error %s: %s', sqlstate, sqlerrm));
end $$;

-- Runs a write and asserts the number of rows it actually changed. RLS denies a
-- read-side (USING) violation silently, so 0 is the denial signal here.
create or replace function public.t_changed(suite text, label text, statement text, expected bigint)
returns void language plpgsql as $$ declare got bigint; begin
  execute statement; get diagnostics got = row_count;
  perform public.t_record(suite, label, got = expected, format('expected %s changed, got %s', expected, got));
exception when others then
  perform public.t_record(suite, label, false, format('unexpected error %s: %s', sqlstate, sqlerrm));
end $$;

-- Asserts that a write is rejected, optionally by a specific SQLSTATE
-- (42501 = row-level security violation, 23514 = check constraint).
create or replace function public.t_rejected(suite text, label text, statement text, expected_state text default '42501')
returns void language plpgsql as $$ begin
  execute statement;
  perform public.t_record(suite, label, false, 'statement unexpectedly succeeded');
exception when others then
  perform public.t_record(suite, label, sqlstate = expected_state, format('expected %s, got %s: %s', expected_state, sqlstate, sqlerrm));
end $$;

create or replace function public.t_allowed(suite text, label text, statement text)
returns void language plpgsql as $$ begin
  execute statement;
  perform public.t_record(suite, label, true, null);
exception when others then
  perform public.t_record(suite, label, false, format('unexpected error %s: %s', sqlstate, sqlerrm));
end $$;

create or replace function public.t_true(suite text, label text, query text, expected boolean default true)
returns void language plpgsql as $$ declare got boolean; begin
  execute query into got;
  perform public.t_record(suite, label, coalesce(got, false) = expected, format('expected %s, got %s', expected, got));
exception when others then
  perform public.t_record(suite, label, false, format('unexpected error %s: %s', sqlstate, sqlerrm));
end $$;

create or replace function public.t_finish(wanted_suite text) returns void language plpgsql as $$
declare total bigint; failed bigint; row_out record; begin
  select count(*), count(*) filter (where not ok) into total, failed
  from public.test_results where suite = wanted_suite;
  if failed > 0 then
    for row_out in select label, detail from public.test_results where suite = wanted_suite and not ok loop
      raise warning 'FAILED %: %', row_out.label, row_out.detail;
    end loop;
    raise exception '% : %/% checks failed', wanted_suite, failed, total;
  end if;
  raise notice '% : %/% checks passed', wanted_suite, total, total;
end $$;
