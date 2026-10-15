# Deployment

Current architecture and open integrations: [AGENTS.md](AGENTS.md). Historical rollout evidence: [release archive](docs/history/ENGINEERING_STATUS_THROUGH_20261013.md).

Production runs on the Reid Ubuntu host: Docker web/API, a private Cloudflare Tunnel, Supabase project `cfxntjnewkmlvkogfxyu`, and a restricted SSH AI relay. The September Supabase migration is complete. Do not run the old hard-coded `scripts/provision-local.mjs` to provision or switch projects.

Credentials live outside Git in `/home/reid/.config/reid-os/` with mode 0600. Never print them, copy them into build context, or replace existing encryption/session keys while updating application code.

## Release sequence

1. Branch from the current deployed release. Local main may lag: October 13 is on `release/2026-10-13-modernization`. Preserve it when building a successor.
2. Run frontend/service tests, production build, full SQL/RLS harness, security checks and authenticated/mobile browser review. Record actual results in the feature document.
3. Open a feature PR for review and staging checks, then a separate Owner-approved production release. Do not claim a local build is deployed.
4. Apply reviewed additive migrations to the explicitly verified target project before changing the API image. Check migration history; never reconcile unrelated history blindly.
5. Build uniquely tagged candidate images. Check their unprivileged tests and Arabic PDF rendering. Preserve the running web/API images with rollback tags.
6. Inspect pending jobs/outbox before an API restart. Preserve the encrypted QR session volume and SESSION_KEY. Activate only the reviewed candidate. Never send a real test message without explicit messaging authorization.
7. Check public health and static bundle identity, anonymous private-API denial, authenticated component health, WhatsApp session, and queue states. Record commit, image, migration, checks and remaining blockers.
8. Roll back to saved images if required. Database migrations are additive; reconcile any new writes before a data rollback.

QR operations:

- Link at `https://reidpro.com/connections` using WhatsApp → Linked devices → Link a device. Only an active Owner may see or create the QR.
- The encrypted session is in the `qr-session` Docker volume; its encryption key is in `service.env`. Back up or restore both together. Possessing only one is insufficient.
- To revoke access, remove the linked device from the Reid phone. If the service reports `scan_required`, scan a new code.
- Never auto-retry an `uncertain` outbox item. Check the phone first to avoid a duplicate external message.
- Cloud API send paths stay disabled while `REID_WHATSAPP_TRANSPORT=qr` is set in Reid and Supabase. Do not re-enable without an explicit Owner migration decision.
- An Owner can check health from WhatsApp with `حالة النظام`, `حالة الموقع`, `حالة السيرفر` or `حالة واتساب`. Host metrics are read by the API container itself; no host timer or sudo is required.
- Before rebuilding `api`, tag the running image (for example `docker tag reid-services:local reid-services:rollback-YYYYMMDD`) and confirm the outbox has no pending item. Roll back by retagging that image as `reid-services:local` and running `docker compose up -d --no-deps api`.

## Candidate verification commands

Run commands in an environment with Node 22/npm; this host may require the cached Node/Docker tooling. `scripts/rls-local.sh` creates a disposable database. Never target production with that harness.

```bash
npm run check
(cd server && npm test)
scripts/rls-local.sh
node scripts/secret-scan.mjs
docker build -t reid-services:candidate server
docker run --rm --network none --read-only --tmpfs /tmp \
  --mount "type=bind,source=$PWD/server/test,target=/service/test,readonly" \
  --entrypoint npm reid-services:candidate test
docker run --rm --network none --read-only --tmpfs /tmp \
  --entrypoint node reid-services:candidate verify-pdf.mjs
```

The Arabic PDF fonts are bundled under `server/assets/fonts/`. Do not rely on system fonts or root-only source-file permissions. Runtime code must be readable by the image's node user.

For laptop installation and meeting activation, use [the integration runbook](INTEGRATION_ACTIVATION.md). New connected-operations migration: `202610140001_connected_operations.sql`; its deployment status is in [the feature record](docs/CONNECTED_OPERATIONS.md).
