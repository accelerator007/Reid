# Decisions
1. Vite React preserves the simple Pages deployment; server concerns use Supabase Edge Functions.
2. Supabase is source of truth; Workers are only for a narrow authenticated Ollama gateway if free allowance suffices.
3. Requested model is recorded as `gemma4:12b`. `ai-lap`: RTX 3080 Ti 12GB, RAM 32GB, Ryzen 9 5950X. The model name does not match a published Gemma release and must be re-verified on the host.
4. Supabase free requires a separate weekly logical backup.
5. Model providers are data, not code. `llm_providers` holds the endpoint, model, and clearance ceiling; the gateway dispatches on `kind`. Restoring `ai-lap` is a row update, not a rewrite.
6. Google Gemini is a temporary external provider while `ai-lap` is offline, capped at `internal` data. HR, finance, and CRM agents stay disabled rather than sending company data to an external service, and the cap is enforced by a database trigger so the gateway cannot be the only guard.
7. Prompts are stored as a SHA-256 hash and answers as a 280-character preview. A run stays auditable without the database accumulating company text.
