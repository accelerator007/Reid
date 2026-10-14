# Connected operations — 2026-10-14

Status: implemented and verified locally; not deployed. Based on the deployed October 13 release (`df3ff3c` / application `90e1d7f`) so the research/Connections changes are preserved.

## User behavior

An Owner opens a direct customer conversation and chooses **Link client & follow up**. One save matches the international phone to an existing CRM contact (or explicitly selects a contact), creates a contact when needed, and creates a lead, support request and assigned task. An existing project can be selected, or a new client project created. All records commit in one authenticated database transaction. Concurrent/retried saves lock the conversation and reuse the linked records. Ambiguous phone matches require an explicit choice.

The conversation shows links to the exact CRM lead, request, task and project. Those destinations support record-specific URLs. There is one durable follow-up per conversation; its assignment/title/due date can be updated. Existing linked contact/project choices are preserved by the editor. Additional unrelated work can still be created in the normal project/task modules.

Task assignment generates the existing employee notification. Closing or reopening a linked task/request keeps their statuses and the lead follow-up due state synchronized. A review remains a review; it is not silently downgraded by the task synchronization. Employees do not gain access to conversation links or WhatsApp data.

Home lists up to 30 real pending customer handoffs, overdue tasks, requests in review and CRM follow-ups, ordered by category then oldest. Each row opens the relevant item. Errors remain visible instead of becoming an empty list.

## Replies and operational resilience

Public, WhatsApp and helper chat calls now share `server/ai-runtime.mjs`. It disables model thinking, bounds generation and duration per workload, limits parallel inference to three calls, opens a 30-second circuit after three failures, and allows one recovery probe. Empty or invalid structured replies are failures. Accounting errors cannot discard a successful reply.

No external fallback is activated. Existing customer failure/human-handoff behavior remains available, while repeated provider failures fail promptly. WhatsApp no longer makes a second inference request solely to replace a repeated opening. Model center diagnostics show recent successful-response median/P95, failed calls, concurrency and circuit state; they retain no prompt content. Durable provider usage includes WhatsApp chat token accounting.

## Integrations and documentation

Connections checks Google authorization, Recall access, local AI/TTS and the configured transcription flag without creating a meeting. It explicitly distinguishes that check from a real join/listen/speak test. Database errors are not presented as a disconnected Google account.

The laptop update archive includes tested source and an installer with adapter backup, health/version verification and rollback. It needs an actual shell-capable ai-lap operator login; the existing forwarding key cannot install it. The historical laptop worker is not restarted against the old project.

Current architecture, release instructions and blockers are now separated from the historical engineering log. No historical unresolved audit entry was deleted; those remain in the archive for explicit re-verification.

## Verification

- Frontend: 388 Vitest checks across 25 files; TypeScript and Vite production build.
- Service: 258 Node tests pass in the candidate image as its default unprivileged user, including circuit recovery, concurrency, accounting, validation and non-creating meeting checks.
- Full isolated PostgreSQL migration/RLS harness passes; customer journey suite passes 20/20 checks covering idempotent creation, notifications, linked status synchronization, owner/employee/anonymous access and concrete action links.
- Eight browser combinations: Arabic/English, light/dark, desktop 1440px and mobile 390px. Exercised Home, follow-up form save/links and meeting preflight. No page errors or horizontal overflow; screenshots under `test-results/connected-operations/`. Fixtures are synthetic; this is not an authenticated production test.
- Real local model: four synthetic cases pass (Omani intake, document date/source, no fabricated send receipt, absent document price). Latest successful sample took approximately 0.6–1.4 seconds per case after warm-up. This small sample is not a general accuracy or speed guarantee. Results in `test-results/reply-evaluation.json`.
- Existing public browser suite: 9 passed; 6 live authenticated cases skipped without their opt-in credentials.
- Secret scan: clean across 453 tracked files; no runtime credentials are included.
- Laptop Python suite: 18 tests pass. The candidate API also passes the Arabic PDF rendering check.
- Candidate API image: `reid-services:candidate-connected-20261014`.

## Release and remaining dependencies

Apply `202610140001_connected_operations.sql` to the reviewed target before activating the API/web release. A reviewed production release and target-environment verification remain required. Local main and develop diverge from the deployed release, so the feature preserves the release branch; do not overwrite it from stale branch tips.

No outbound message, live customer record, production schema or running production container was changed by this implementation. Four synthetic local inference calls per evaluation run were the only model exercises.

Meetings still require the company Recall key, region/ElevenLabs configuration, Owner Google consent and a real call. The adapter still requires shell-capable laptop access. See [activation steps](../INTEGRATION_ACTIVATION.md). These integrations are prepared, not claimed active.
