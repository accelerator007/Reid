#!/usr/bin/env bash
# Deploy the redesigned website and Reid Assistant to Production. The assistant
# starts in dry-run mode (no real calls or messages).
#
# Run on the Reid host from the Reid-web repository root, as the `reid` user:
#   scripts/deploy-reid-assistant.sh
#
# What it does, in order, stopping at the first failure:
#   1. Pre-flight: WhatsApp outbox empty, only migration 202609280002 pending,
#      candidate images present.
#   2. Applies migration 202609280002_reid_assistant_emergency.sql.
#   3. Creates /home/reid/.config/reid-os/assistant.env (mode 600, dry run,
#      telephony disabled) and adds REID_OPS_STATUS_TOKEN to service.env.
#   4. Tags the running images for rollback, promotes the tested candidates.
#   5. Recreates api, then web, then starts the assistant, waiting for health.
#   6. Verifies the public site and the new routes.
#
# Candidates are built and tested beforehand:
#   reid-services:candidate-assistant  (repo server/, 195/195 tests inside the image)
#   reid-web:candidate-redesign        (new design + fonts + nginx routes; override with
#                                       WEB_CANDIDATE=reid-web:candidate-assistant to ship
#                                       only the nginx routes on the current site)
#   reid-assistant:local               (../reid-assistant)
set -euo pipefail

CONFIG=/home/reid/.config/reid-os
WEB_CANDIDATE="${WEB_CANDIDATE:-reid-web:candidate-redesign}"
STAMP="$(date -u +%Y%m%d%H%M)"
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'ABORT: %s\n' "$*" >&2; exit 1; }
healthy() {
  for _ in $(seq 1 30); do
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  return 1
}

say "1. Pre-flight"
for image in reid-services:candidate-assistant "$WEB_CANDIDATE" reid-assistant:local; do
  docker image inspect "$image" >/dev/null 2>&1 || fail "missing image $image"
done
pending_outbox="$(supabase db query --linked \
  "select count(*) as n from public.qr_outbox where status in ('queued','sending','uncertain')" 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["rows"][0]["n"])')"
[ "$pending_outbox" = "0" ] || fail "WhatsApp outbox has $pending_outbox pending item(s); wait or check the phone first"
pending_migrations="$(supabase db push --linked --dry-run 2>/dev/null | grep -c '•' || true)"
supabase db push --linked --dry-run 2>/dev/null | grep -q '202609280002_reid_assistant_emergency.sql' \
  || fail "migration 202609280002 is not the pending migration (already applied?)"
[ "$pending_migrations" = "1" ] || fail "expected exactly one pending migration, found $pending_migrations"
echo "outbox empty; one pending migration; candidate images present"

say "2. Migration 202609280002"
echo y | supabase db push --linked
supabase db query --linked \
  "select count(*) as n from pg_tables where schemaname='public' and tablename like 'emergency_%' and rowsecurity" 2>/dev/null \
  | python3 -c 'import sys,json; n=json.load(sys.stdin)["rows"][0]["n"]; assert n==3, n; print("3 emergency tables with RLS")'

say "3. Configuration"
value() { grep -E "^$1=" "$CONFIG/service.env" | head -1 | cut -d= -f2-; }
if ! grep -q '^REID_OPS_STATUS_TOKEN=' "$CONFIG/service.env"; then
  cp -p "$CONFIG/service.env" "$CONFIG/service.env.pre-assistant-$STAMP"
  printf 'REID_OPS_STATUS_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$CONFIG/service.env"
fi
if [ ! -f "$CONFIG/assistant.env" ]; then
  umask 077
  {
    echo "REID_ASSISTANT_PUBLIC_URL=https://reidpro.com"
    echo "SUPABASE_URL=$(value SUPABASE_URL)"
    echo "SUPABASE_ANON_KEY=$(value SUPABASE_ANON_KEY)"
    echo "SUPABASE_SERVICE_ROLE_KEY=$(value SUPABASE_SERVICE_ROLE_KEY)"
    echo "AI_URL=$(value AI_URL)"
    echo "AI_TOKEN=$(value AI_TOKEN)"
    echo "REID_ASSISTANT_INTERNAL_TOKEN=$(openssl rand -hex 32)"
    echo "REID_OPS_STATUS_URL=http://api:8090/internal/operations/status"
    echo "REID_OPS_STATUS_TOKEN=$(value REID_OPS_STATUS_TOKEN)"
    echo "REID_ASSISTANT_TELEPHONY=disabled"
    echo "REID_ASSISTANT_DRY_RUN=1"
  } > "$CONFIG/assistant.env"
fi
chmod 600 "$CONFIG/service.env" "$CONFIG/assistant.env"
for name in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY AI_URL AI_TOKEN REID_OPS_STATUS_TOKEN; do
  grep -qE "^$name=.+" "$CONFIG/assistant.env" || fail "assistant.env is missing $name"
done
echo "assistant.env ready (dry run, telephony disabled); secrets not printed"

say "4. Rollback tags and promotion"
docker tag reid-services:local "reid-services:pre-assistant-$STAMP"
docker tag reid-web:local "reid-web:pre-assistant-$STAMP"
docker tag reid-services:candidate-assistant reid-services:local
docker tag "$WEB_CANDIDATE" reid-web:local
echo "rollback images: reid-services:pre-assistant-$STAMP reid-web:pre-assistant-$STAMP"

say "5. Recreate api, web and start the assistant"
docker compose up -d --no-deps api
healthy reid-services || fail "reid-services is not healthy (roll back with the tags above)"
docker compose up -d --no-deps web
healthy reid-web || fail "reid-web is not healthy (roll back with the tags above)"
docker compose --profile assistant up -d --no-deps assistant
healthy reid-assistant || fail "reid-assistant is not healthy (docker logs reid-assistant)"

say "6. Verification"
check() { code="$(curl -s -o /dev/null -w '%{http_code}' "${@:2}")"; [ "$code" = "$1" ] || fail "expected $1 from ${*:2}, got $code"; echo "$1  ${*:2}"; }
check 200 https://reidpro.com/healthz
check 200 https://reidpro.com/
check 200 https://reidpro.com/assistant
check 401 https://reidpro.com/api/operations/status
check 401 https://reidpro.com/assistant-api/v1/me
check 403 -X POST https://reidpro.com/voice/turn -d Digits=1
font="$(docker exec reid-web sh -c 'ls /usr/share/nginx/html/assets' | grep -m1 'woff2$' || true)"
[ -z "$font" ] || check 200 "https://reidpro.com/assets/$font"
docker exec reid-assistant python -c "
import urllib.request, os
request = urllib.request.Request('http://api:8090/internal/operations/status',
                                 headers={'x-reid-internal-token': os.environ['REID_OPS_STATUS_TOKEN']})
status = __import__('json').load(urllib.request.urlopen(request, timeout=10))
print('internal status reachable; whatsapp:', status['components']['whatsapp']['status'])"
docker logs --since 2m reid-services 2>&1 | grep -m1 -i 'whatsapp linked' || echo "(WhatsApp link message not seen yet; check /connections)"

cat <<EOF

Done. Reid Assistant runs in DRY RUN: it monitors and records incidents but
sends no WhatsApp message and places no call.

Roll back:
  docker tag reid-services:pre-assistant-$STAMP reid-services:local
  docker tag reid-web:pre-assistant-$STAMP reid-web:local
  docker compose up -d --no-deps api web
  docker compose --profile assistant stop assistant
The migration only adds new tables and functions; it can stay in place.
EOF
