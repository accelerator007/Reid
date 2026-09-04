#!/usr/bin/env bash
# Apply every Reid migration to a throwaway PostgreSQL 16 instance and run the
# RLS allow/deny suites against it as real anon / authenticated roles.
#
# Usage: scripts/rls-local.sh
# Requires: postgresql-16 server binaries (initdb, pg_ctl) and psql.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${RLS_LOCAL_PORT:-55432}"
host="${RLS_LOCAL_HOST:-localhost}"
db="${RLS_LOCAL_DB:-reid_rls}"
bin="${RLS_LOCAL_PGBIN:-/usr/lib/postgresql/16/bin}"
state="${RLS_LOCAL_STATE:-}"
psql_bin="$(command -v psql)"

start_server() {
  [ -n "$state" ] || state="$(mktemp -d)"
  if "$psql_bin" -h "$host" -p "$port" -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    return 0
  fi
  local as_root=()
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
    state="$(mktemp -d -p /var/lib/postgresql)"
    chown -R postgres:postgres "$state"
    as_root=(su postgres -c)
  fi
  local init="PATH=$bin:\$PATH initdb -D $state/data -U postgres --auth=trust --no-sync"
  local run="PATH=$bin:\$PATH pg_ctl -D $state/data -o '-p $port -c listen_addresses=$host -c fsync=off -c wal_level=logical' -l $state/pg.log start"
  if [ ${#as_root[@]} -gt 0 ]; then "${as_root[@]}" "$init" >/dev/null; "${as_root[@]}" "$run" >/dev/null
  else eval "$init" >/dev/null; eval "$run" >/dev/null; fi
}

start_server
run() { "$psql_bin" -h "$host" -p "$port" -U postgres -v ON_ERROR_STOP=1 "$@"; }

run -d postgres -c "drop database if exists $db" >/dev/null
run -d postgres -c "create database $db" >/dev/null
run -q -d "$db" -f "$root/supabase/tests/local/bootstrap.sql" >/dev/null

for migration in "$root"/supabase/migrations/*.sql; do
  # pgvector is unavailable in the harness; bootstrap.sql supplies a shim domain.
  # No RLS policy reads an embedding, so dropping the dimension modifier is safe.
  sed -e 's/^create extension if not exists vector with schema extensions;$/-- vector extension shimmed by bootstrap.sql/' \
      -e 's/extensions\.vector([0-9]*)/extensions.vector/g' "$migration" \
    | run -q -d "$db" -f - >/dev/null
done
# Supabase grants table privileges to anon/authenticated by default; RLS, not
# GRANT, is the authorization boundary. Function grants come from the default
# privileges set in bootstrap.sql so the migrations' own REVOKEs still bind.
run -q -d "$db" -c "grant all on all tables in schema public to anon, authenticated;" >/dev/null

status=0
for suite in "$root"/supabase/tests/local/rls_*.sql; do
  echo "── $(basename "$suite")"
  run -d "$db" -f "$suite" || status=1
done
exit "$status"
