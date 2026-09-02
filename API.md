# API
Use Supabase client calls for RLS-safe reads. Edge Functions own privileged mutations: `submit-application`, `decide-application`, `agent-command`, `drive-sync`, `executive-report`. Validate JWT, roles, approval level, request ID and idempotency key. Public endpoints use Turnstile and rate limits.
