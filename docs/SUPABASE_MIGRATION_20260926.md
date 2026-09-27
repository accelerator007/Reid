# Reid project migration — 2026-09-26

Production switched from `pkogchbrknwmzefjklkr` to the Owner-selected
`cfxntjnewkmlvkogfxyu` at **18:24 UTC on 2026-09-26**. The website, full API,
WhatsApp bridge and new agent queue worker now use the destination. The encrypted
WhatsApp session and its original encryption key were preserved; WhatsApp linked
again without a QR reset. The old project was not deleted.

## Authorization and authentication

The Owner replaced the initial fresh-start instruction with migration of all
existing accounts/data. After confirming they could not access the old project's
management account, they accepted migration with new passwords instead of
preserving unavailable password hashes. The Owner subsequently selected **Google
and normal email/password** as the two sign-in methods. Microsoft/GitHub buttons
are removed; their destination providers are disabled. Public signup stays off.

The destination email provider is enabled and a synthetic account successfully
signed in using its email/password. Global `auth.enable_signup=false` prevents
public account creation; `auth.email.enable_signup=true` is required by this CLI
configuration to keep the email provider itself enabled.

Google was configured by the Owner on 2026-09-27. The public Auth settings report
Google enabled, while the management configuration confirms both client ID and
secret are present. A live authorization probe returned HTTP 302 to
`accounts.google.com` with only `email profile` scope and the exact callback
`https://cfxntjnewkmlvkogfxyu.supabase.co/auth/v1/callback`. The Owner's migrated
account already has Google and email identities, so the same email resolves to the
preserved account. The final Google consent/account-selection click remains a
human browser action and was not automated.
The company Owner account and its original UUID/role were verified. Existing
passwords do not transfer; accounts need a new password. No migration email or
test WhatsApp message was sent. Custom SMTP is not configured, so broad email
invitation/recovery delivery is not verified.

## Data restored and validated

- Applied 54 migrations, including the production-only `whatsapp_pending_sends`
  ledger discovered through source OpenAPI. All 79 public base tables have RLS.
- Restored 116 Auth users and 117 original identities with original IDs, metadata,
  verification and ban state. One OAuth-only user received an additional email
  identity, giving 118 identities. No user had a verified MFA factor. Existing
  sessions, password hashes and provider secrets were unavailable and not copied.
- Restored 22,112 public records across 76 persisted tables; the 77th exposed
  resource is a derived workshop-count view. Relationships were checked against
  every public foreign key and the Auth identity foreign keys.
- Copied all 11 files in six private buckets and verified byte SHA-256 equality.
  The real Owner's scoped session downloaded and hash-verified all 11 files.
  Paths and application ownership records were preserved. Storage service object
  IDs/upload timestamps/owner metadata were not exactly restored: the source list
  API does not expose the original owner. Current file policies use preserved
  record/path permissions, and Owner access was exercised.
- The source API export is not a transactional database dump. Before cutover the
  old web/API were stopped and all exposed table contents plus account UUIDs were
  compared with the export; only the old runner heartbeat differed. Other source
  clients were not administratively locked because old management access remains
  unavailable. Final destination comparison found all expected source records
  unchanged after the explicitly approved policy differences.
- Preserved historical finance records while disabling Finance and its tools.
  Retained new web tools absent from the old source. Disabled the cloud Gemini
  provider and set local-only Edge Function policy. Validation created additional
  audit records and one successful embedding job; synthetic users were deleted.

## Services and verification

All nine Edge Functions are deployed. New internal runner/QR/gateway/cron secrets
are private server-side values. The existing authenticated relay still reaches
ai-lap for local models. A new `reid-agent-runner` container polls the new project;
the physical ai-lap worker still polls the old project and is not used by the new
site. The relay worker omits local CPU/RAM/GPU telemetry so it cannot attribute
Reid host measurements to ai-lap. The physical ai-lap CPU/RAM/GPU telemetry remains
unavailable on the destination; heartbeat and AI health are verified separately.

Validation passed: SQL/RLS harness after migration 54; rollback-only transactional
restore before commit; all copied relationships/counts; Owner Auth/role/project
access; ordinary-user rejection from the Owner API and administrator-memory rows;
all private-file hashes; real local embedding through the new queue; 192 server
checks in the actual candidate image; 202 frontend tests and production build;
runner telemetry isolation and four agent-quality checks. Public authenticated
operations status returned healthy website, database, AI, runner and connected
WhatsApp, with zero pending/failed/uncertain queue items. The public health route
returned 200. Browser headers are needed for the public edge's bot filtering.

## Recovery and operational controls

Private encrypted exports, private SQL staging files, credentials and detailed
verification results are outside Git in
`/home/reid/.local/state/reid-migration-20260926/`. Do not print, commit or attach
that directory. Export directories are 0700 and sensitive files are 0600.

`scripts/export-project-api.py` exports authenticated user details and all exposed
records/storage into AES-GCM records. `scripts/prepare-project-import.py` verifies
all hashes, refuses verified MFA/unrelated destination users/schema drift, and
prepares a rollback-only SQL transaction by default. `--stage-dir` creates private
SQL upload chunks in a non-public schema to avoid the Management API request-size
limit. Upload those chunks only to the explicitly selected destination; execute
the small restore transaction with explicit `--project-ref`. The actual committed
restore dropped the staging schema. Do not rerun against active production: it
replaces public rows and would discard new writes.

The original runtime environment files remain private as `service-source.env`
and `build-source.env`. Images `reid-services:pre-migration-20260926` and
`reid-web:pre-migration-20260926` preserve the previously running source deployment.
A rollback now requires reconciling new-project writes first; do not simply point
production back at the old database and lose activity. The existing QR volume and
`SESSION_KEY` must always stay together. Compose's `migrated` profile starts the
new worker with `/home/reid/.config/reid-os/runner.env`.

Remaining integration work: custom SMTP/email acceptance, web-search provider
credentials, and optional direct ai-lap telemetry.
No claim is made that unavailable source OAuth/SMTP/cron configuration, non-exposed
schemas or all historical Storage service metadata were reproduced.

References: [Auth user migration](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects),
[Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
