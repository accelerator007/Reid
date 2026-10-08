#!/usr/bin/env bash
# Publish the website from the current commit. Touches only the web container:
# the API, WhatsApp, the assistant and the database are left alone.
#
# Run on the Reid host from the Reid-web repository root:
#   scripts/deploy-web.sh
#
# 1. Refuses to run with uncommitted changes, so Production always matches a commit.
# 2. Builds reid-web:candidate-<commit> with the production build settings and
#    checks it (nginx config, bundled fonts, Supabase project) before use.
# 3. Tags the running image for rollback, swaps, waits for health.
# 4. Verifies the public site serves the new build.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=/home/reid/.config/reid-os
STAMP="$(date -u +%Y%m%d%H%M)"
say() { printf '\n== %s\n' "$*"; }
fail() { printf 'ABORT: %s\n' "$*" >&2; exit 1; }

say "1. Source"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes; commit first so Production matches a commit"
COMMIT="$(git rev-parse --short HEAD)"
CANDIDATE="reid-web:candidate-$COMMIT"
echo "branch $(git branch --show-current) at $COMMIT"

say "2. Build and check $CANDIDATE"
set -a
# shellcheck disable=SC1091
. "$CONFIG/build.env"
set +a
docker build -q -t "$CANDIDATE" \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_WHATSAPP_NUMBER="${VITE_WHATSAPP_NUMBER:-96897308003}" \
  --build-arg VITE_APP_URL="${VITE_APP_URL:-https://reidpro.com}" . >/dev/null
docker run --rm --add-host api:127.0.0.1 --entrypoint nginx "$CANDIDATE" -t >/dev/null 2>&1 || fail "nginx config does not load"
project="$(docker run --rm --entrypoint sh "$CANDIDATE" -c 'grep -ho "https://[a-z]*\.supabase\.co" /usr/share/nginx/html/assets/*.js | sort -u')"
[ "$project" = "$VITE_SUPABASE_URL" ] || fail "bundle points at '$project', expected $VITE_SUPABASE_URL"
fonts="$(docker run --rm --entrypoint sh "$CANDIDATE" -c 'ls /usr/share/nginx/html/assets | grep -c woff2')"
[ "$fonts" -ge 10 ] || fail "only $fonts font files bundled"
entry="$(docker run --rm --entrypoint sh "$CANDIDATE" -c 'grep -o "assets/index-[A-Za-z0-9_-]*\.js" /usr/share/nginx/html/index.html')"
echo "nginx ok; project ok; $fonts fonts; entry $entry"

say "3. Rollback tag and swap"
docker tag reid-web:local "reid-web:pre-web-$STAMP"
docker tag "$CANDIDATE" reid-web:local
docker compose up -d --no-deps web
for _ in $(seq 1 30); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' reid-web)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect --format '{{.State.Health.Status}}' reid-web)" = healthy ] || fail "reid-web is not healthy; roll back below"

say "4. Verify"
check() { code="$(curl -s -o /dev/null -w '%{http_code}' "$2")"; [ "$code" = "$1" ] || fail "expected $1 from $2, got $code"; echo "$1  $2"; }
for path in /healthz / /owner /projects /assistant /today; do check 200 "https://reidpro.com$path"; done
live="$(curl -s https://reidpro.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' || true)"
[ "$live" = "$entry" ] || fail "public site serves $live, expected $entry (Cloudflare cache?)"
echo "public site serves $entry"

cat <<EOF

Done: reidpro.com serves commit $COMMIT.
Roll back:
  docker tag reid-web:pre-web-$STAMP reid-web:local && docker compose up -d --no-deps web
EOF
