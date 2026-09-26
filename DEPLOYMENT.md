# Deployment

Migration in progress: the repository CLI link now targets new project
`cfxntjnewkmlvkogfxyu`, while live runtime configuration still targets
`pkogchbrknwmzefjklkr`. The new project has the schema and functions but no migrated
Auth identities/public data yet. Follow `docs/SUPABASE_MIGRATION_20260926.md` before
changing live configuration. Do not run the old hard-coded `provision-local.mjs`
as a migration/cutover command.

Production is hosted on the saved `Reid` Ubuntu host. Docker Compose runs the unprivileged web and QR/API containers; the `reid-local` Cloudflare Tunnel publishes only the web origin at `reidpro.com`. Supabase project `pkogchbrknwmzefjklkr` remains the hosted database/Auth/Storage/Edge Functions system. `ai-lap` runs Ollama and accepts Reid only through the restricted private SSH relay.

Runtime/build credentials live under `/home/reid/.config/reid-os/` with mode `0600`, outside the repository. `scripts/provision-local.mjs` refreshes browser-safe/service configuration without printing credentials and preserves the QR session/bridge keys. Do not copy those files into Git or the Docker build context.

As of 2026-09-26 15:18 UTC, Production runs the phase-1 API from `release/whatsapp-phase1-20260926` and the organising-only website. The working branch contains the full assistant and requires migrations `202609140001`–`202609140005` plus `202609260001` before promotion. Keep `reid-services:candidate` separate from the live `reid-services:local` tag until Supabase login, migrations and Edge Function deployment are complete; rebuilding the live API from this working branch before those steps will break it.

Deploy from an authenticated operator machine by syncing the working tree without `.git`, dependencies, build output or env files; then build `web` and `api` and start the Compose project with `/home/reid/.config/reid-os/build.env`. Confirm every container is healthy, `/healthz` is 200, public HTTPS carries `X-Reid-Origin: local-reid`, an unauthenticated private API call is 401, and the private AI health check succeeds.

QR operations:

- Link at `https://reidpro.com/connections` using WhatsApp → Linked devices → Link a device. Only an active Owner may see or create the QR.
- The encrypted session is in the `qr-session` Docker volume; its encryption key is in `service.env`. Back up or restore both together. Possessing only one is insufficient.
- To revoke access, remove the linked device from the Reid phone. If the service reports `scan_required`, scan a new code.
- Never auto-retry an `uncertain` outbox item. Check the phone first to avoid a duplicate external message.
- Cloud API send paths stay disabled while `REID_WHATSAPP_TRANSPORT=qr` is set in Reid and Supabase. Do not re-enable without an explicit Owner migration decision.
- An Owner can check health from WhatsApp with `حالة النظام`, `حالة الموقع`, `حالة السيرفر` or `حالة واتساب`. Host metrics are read by the API container itself; no host timer or sudo is required.
- Before rebuilding `api`, tag the running image (for example `docker tag reid-services:local reid-services:rollback-YYYYMMDD`) and confirm the outbox has no pending item. Roll back by retagging that image as `reid-services:local` and running `docker compose up -d --no-deps api`.

Database changes remain additive migrations with reviewed RLS. Apply to the linked project, run live allow/deny tests with disposable identities, clean them in `finally`, and reconcile migration history only after the exact schema is verified. Only the Owner promotes feature work through the protected branch/release process.

Assistant service configuration (`server/`): `AI_URL` and `AI_TOKEN` reach the ai-lap adapter for chat, embeddings, transcription and images. `REID_ASSISTANT_SIGNALS=0` disables read receipts, reactions and the typing indicator. `REID_WEB_SEARCH_PROVIDER` (`brave` or `tavily`) with `REID_WEB_SEARCH_KEY` enables web access; leaving the key unset keeps both web tools off, and `REID_WEB_SEARCH_DAILY` caps daily searches (default 60). `REID_PDF_FONT` and `REID_PDF_FONT_BOLD` override the bundled Arabic faces; the service refuses to start a PDF rather than render one without a font that covers Arabic.

The Arabic report font ships inside the repository at `server/assets/fonts/` because the deployment image contains no system fonts at all. Do not rely on an apt-installed font; the CI `server` job builds the image and generates a real Arabic PDF inside it to prove the bundled face is present.

The image copies source as `node:node` because locally created modules can have mode `0600`. Verify the built image as its default user, not root. Production images omit `test/`; mount the suite when testing so `npm test` cannot silently pass with zero tests:

```bash
docker run --rm --network none --read-only --tmpfs /tmp \
  --mount "type=bind,source=$PWD/server/test,target=/service/test,readonly" \
  --entrypoint npm reid-services:candidate test
docker run --rm --network none --read-only --tmpfs /tmp \
  --entrypoint node reid-services:candidate verify-pdf.mjs
docker run --rm --network none \
  --mount "type=bind,source=$PWD,target=/workspace,readonly" \
  --workdir /workspace --entrypoint bash postgres:16 scripts/rls-local.sh
```

Apply migrations `202609140001` through `202609140005` before deploying this build: they add media and reply-quality columns, conversation memory and mood, semantic recall, the web-search quota and the initiative log. `scripts/rls-local.sh` applies every migration to a throwaway database and runs the allow/deny suites; run it before promoting.
