# Reid engineering guide

Last reviewed: 2026-10-23. This file is the current handoff. Historical release evidence and unresolved historical observations are preserved in [the release archive](docs/history/ENGINEERING_STATUS_THROUGH_20261013.md). New changes update this file and their focused documentation before merge.

## Current architecture

- Reid / ريّد is a bilingual Arabic/English company workspace at `reidpro.com`, with RTL/LTR, light/dark and mobile support. COR is a project name, never the company name.
- React 19, TypeScript and Vite 7 frontend; `src/main.tsx` assembles modules and `src/routes.ts` is the shared route/role manifest.
- Production web/API run in Docker on the Reid Ubuntu host behind the private Cloudflare Tunnel. Supabase project `cfxntjnewkmlvkogfxyu` provides Postgres, Auth, Storage, Realtime and Edge Functions. The September migration is complete; the former project is historical.
- `server/` owns WhatsApp QR transport, assistant execution, customer handoffs and provider management. Browser API calls use `src/local-api.ts`; the host requires an active Owner/Super Admin.
- `ai-lap` runs the local model through a restricted authenticated SSH relay. The existing SSH key allows forwarding only, not a laptop shell. `gemma4:12b` and `nomic-embed-text:latest` are the last verified models. Only the local provider was enabled in the October 12 release; external providers need their own successful tests and clearance.
- The active product is intentionally narrow: Home, projects, clients, WhatsApp, team and requests, with assistant, settings, connections and monitoring as supporting tools. Research, workshops, general forms and the live meeting bot are retired from routes and runtime.
- Connections is under `src/connections/`. The older `src/qr-workspace.tsx` is not the active Connections entry.

## Engineering rules

- Work on `feature/*`; do not push directly to main. Prepare a reviewed PR with relevant checks. Production follows a separate Owner-approved release. Keep current live behavior and existing migrations intact.
- Never commit credentials, customer exports, private messages, CVs, tokens or runtime env files. Runtime secrets live outside Git under `/home/reid/.config/reid-os/`. Never print them. Provider keys are held in Supabase Vault and are not browser-readable.
- Never expose Ollama or its adapter publicly. Do not send company data to an external model automatically. Provider clearance and the authenticated caller's permissions remain authoritative; a phone display name grants no authority.
- Every schema change is an additive migration. Enable and verify RLS; test owner/assignee, denied and anonymous paths before release. Service-only RPCs remain revoked from browser roles.
- Approval levels: L0 reads, L1 drafts/tasks, L2 configurable external sending/publishing approval, L3 human decisions for hiring/contracts/finance, L4 Owner for critical operations. Do not retry uncertain outgoing messages or repeat mutations after an ambiguous failure.
- Read Supabase through `src/db.ts`; do not discard errors with `(result.data || [])`. Read identity through `useSession()`. New routes use `Guarded` and the shared route manifest.
- Use `src/tokens.css` for colors/radii, and the `src/ui/` primitives. Preserve bilingual labels, keyboard access, loading/error states and responsive layouts.
- Never report an integration working just because configuration or a UI exists. Distinguish local tests, provider connectivity, staging verification and production deployment.
- First Admin/HR application decision stays atomic; rejection reasons stay internal. Files require their own Storage and row access policies. Guest/company/customer data boundaries must remain separate.

## Latest deployed evidence

- Web: release branch `release/2026-10-13-modernization`, application commit `90e1d7f`, status commit `df3ff3c`. Research modules, rebuilt Connections and clearer tool approvals were deployed October 13. The prior log called this a main commit, but local Git places it on the release branch; do not infer main is synchronized.
- API: October 12 model-center/customer-access release, including public assistant usage accounting. That release recorded 250 service tests, 372 frontend tests, migration/RLS checks and six healthy service flags. October 13 recorded 388 frontend tests. These are historical checks, not today's uptime guarantees.
- WhatsApp has governed user/group settings, customer classification, durable human handoffs, document extraction and scoped memory. New groups default disabled.
- Backup/restore verification exists: encrypted public-table exports plus a disposable restore rehearsal. This is not a complete managed Auth/Storage disaster-recovery backup.

## Current work: product simplification

Branch: `feature/reid-connected-operations`. See [the simplification plan and release order](docs/PRODUCT_SIMPLIFICATION_20261023.md) and [connected-operations implementation](docs/CONNECTED_OPERATIONS.md).

- Customer follow-up links a conversation to CRM contact/lead, support request, task and optional project through one authenticated database transaction. Conversation locking makes retries idempotent. Task assignment uses the existing notification trigger.
- Home has concrete pending handoff, overdue task, review and CRM-follow-up links; destination pages accept record-specific URLs.
- Local chat requests share bounded generation, concurrency limits, circuit recovery and content-free latency/token accounting. WhatsApp no longer regenerates a whole answer just to change its opening. No automatic external fallback is enabled.
- The homepage presents COR under Company Achievements with a clearly labelled generated concept image and a non-clinical product summary.
- Project detail is reduced to Overview, Tasks, Files and Activity. Milestones, KPIs and manual project meeting records remain inside Overview.
- Migration `202610230001_product_simplification.sql` removes retired feature data after the web/API release and verified backup.
- The Owner dashboard is now the **System & AI center**: one responsive view combines Reid host telemetry, ai-lap CPU/GPU/model telemetry, service health, WhatsApp activity, queues, reply-runtime metrics and links to the model/API controls. WhatsApp keeps only its channel-specific health to avoid duplicating the server view.
- Verification and deployment status are recorded in the focused document. This section must not be described as production-live until its release evidence is added.

## Remaining external dependencies and open verification

- Physical ai-lap installation requires a shell-capable operator login. A port-forward-only key cannot install adapter/runner files. The prepared bundle does not mean it has been installed.
- External model fallback has no enabled, tested provider at the last recorded release. Do not silently widen data clearance or enable an untested model.
- SMTP/invitation delivery, company Microsoft/GitHub OAuth, full Auth/Storage recovery and previously requested credential rotations still require explicit verification; archived entries are not proof they are resolved.
- Historical audit findings remain in the archive. Confirm current behavior before promoting any old item to fixed or broken.

## Verification and delivery

Run relevant frontend Vitest + TypeScript/Vite build, service Node tests, the full `scripts/rls-local.sh` migration/role harness for SQL changes, browser interaction and Arabic/English light/dark mobile previews for UI changes. Verify the production image as its unprivileged user, including the Arabic PDF check. Credentials stay outside build contexts.

Definition of done: real happy path, denied access, validation/error handling, audit, relevant notifications and responsive UI pass in the target environment; PR/release state, checks and limitations are recorded. See [deployment](DEPLOYMENT.md).
