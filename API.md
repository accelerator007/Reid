# API boundaries

Current reference: [AGENTS.md](AGENTS.md) and [architecture](docs/ARCHITECTURE.md).

Browser database reads/writes use `src/db.ts` with the user's Supabase session and table RLS. Privileged account/agent operations use the existing Edge Functions. Host APIs under `/api/` are called through `src/local-api.ts`; the server authenticates the token, active account and Owner/Super Admin role before administrative routes.

- `/api/whatsapp/*`: conversations, governed access/settings, handoffs and durable customer follow-up.
- `/api/llm/*`: tested provider configuration, encrypted credentials and assignments.
- `/api/ai/health` and `/api/ai/runtime`: model connectivity and content-free runtime diagnostics.
- `/api/meet/status`, `/api/meet/google/connect`, `/api/meet/preflight`: meeting configuration, consent and non-creating dependency checks. OAuth callback validates signed state.
- `/api/operations/status`: private component health; `/api/monitor/health` publishes bounded booleans only.
- `/api/public/chat`: bounded public assistant route before the Owner middleware, with global/per-client rate limits and no internal tools.

`save_customer_journey` and `owner_action_items` also authenticate the caller in PostgreSQL. The host uses the scoped user client for these RPCs, never a browser-supplied actor ID. Mutation retries are serialized by conversation; errors are returned instead of substituting empty data. External send and sensitive agent operations retain their existing approval/idempotency boundaries.

New connected-operations routes require the pending release and migration; see [release status](docs/CONNECTED_OPERATIONS.md). This file describes contracts, not proof of production activation.
