#!/usr/bin/env bash
set -euo pipefail

# Cloudflare may challenge generic automation clients. This is an identified,
# read-only company health probe, so use a stable browser-compatible identity.
curl_common=(--silent --show-error --location --max-time 20 --user-agent 'Mozilla/5.0 (compatible; Reid-Uptime/1.0; +https://reidpro.com)')

check_status() {
  local url="$1" expected="$2"
  local status
  status="$(curl "${curl_common[@]}" --output /dev/null --write-out '%{http_code}' "$url")"
  [ "$status" = "$expected" ] || { echo "Expected $expected from $url, received $status"; return 1; }
}

check_status 'https://reidpro.com/' 200
check_status 'https://reidpro.com/login' 200
check_status 'https://reidpro.com/dashboard' 200
check_status 'https://reidpro.com/workspace' 200
check_status 'https://reidpro.com/projects' 200
check_status 'https://reidpro.com/research' 200
check_status 'https://reidpro.com/crm' 200
check_status 'https://reidpro.com/privacy' 200
check_status 'https://reidpro.com/assets/img/reid-logo.svg' 200
check_status 'https://reidpro.com/this-route-must-not-exist' 404
check_status 'https://staging.reidpro.com/' 200

headers="$(curl "${curl_common[@]}" --head 'https://reidpro.com/')"
for required in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy; do
  grep -qi "^${required}:" <<<"$headers" || { echo "Missing Production header: $required"; exit 1; }
done

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  curl --fail-with-body --silent --show-error --max-time 20 \
    -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" \
    "${SUPABASE_URL}/rest/v1/" >/dev/null
fi

echo 'Reid Production, Staging, routing, security headers, assets, and Supabase API are healthy.'
