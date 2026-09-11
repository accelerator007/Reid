# Deployment

Production is hosted on the saved `Reid` Ubuntu host. Docker Compose runs the unprivileged web and QR/API containers; the `reid-local` Cloudflare Tunnel publishes only the web origin at `reidpro.com`. Supabase project `pkogchbrknwmzefjklkr` remains the hosted database/Auth/Storage/Edge Functions system. `ai-lap` runs Ollama and accepts Reid only through the restricted private SSH relay.

Runtime/build credentials live under `/home/reid/.config/reid-os/` with mode `0600`, outside the repository. `scripts/provision-local.mjs` refreshes browser-safe/service configuration without printing credentials and preserves the QR session/bridge keys. Do not copy those files into Git or the Docker build context.

Deploy from an authenticated operator machine by syncing the working tree without `.git`, dependencies, build output or env files; then build `web` and `api` and start the Compose project with `/home/reid/.config/reid-os/build.env`. Confirm every container is healthy, `/healthz` is 200, public HTTPS carries `X-Reid-Origin: local-reid`, an unauthenticated private API call is 401, and the private AI health check succeeds.

QR operations:

- Link at `https://reidpro.com/connections` using WhatsApp → Linked devices → Link a device. Only an active Owner may see or create the QR.
- The encrypted session is in the `qr-session` Docker volume; its encryption key is in `service.env`. Back up or restore both together. Possessing only one is insufficient.
- To revoke access, remove the linked device from the Reid phone. If the service reports `scan_required`, scan a new code.
- Never auto-retry an `uncertain` outbox item. Check the phone first to avoid a duplicate external message.
- Cloud API send paths stay disabled while `REID_WHATSAPP_TRANSPORT=qr` is set in Reid and Supabase. Do not re-enable without an explicit Owner migration decision.

Database changes remain additive migrations with reviewed RLS. Apply to the linked project, run live allow/deny tests with disposable identities, clean them in `finally`, and reconcile migration history only after the exact schema is verified. Only the Owner promotes feature work through the protected branch/release process.
