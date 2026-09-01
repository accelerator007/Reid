# Reid Engineering Agent Guide
## Mission and stack
Build Reid at `reidpro.com` using React/Vite, TypeScript, Supabase and the existing Cloudflare Pages Git integration. Production is `main`; staging is `develop`; work starts on `feature/*`. Never commit secrets, DB passwords, tokens, CVs, HR files or production exports.

## Runtime
All agents use `gemma4:12b` through Ollama on `ai-lap`; prompts, tools, permissions and memory differ. V1: CEO, Operations, Marketing, Content/Social, Sales/CRM, Analytics, Knowledge, HR, Finance, Support, Competitor Intelligence.

## Rules
- RLS before data. L0/L1 may auto-run; L2 external actions are configurable; L3 always needs a human; L4 needs Owner and future MFA.
- HR documents/CVs only for HR Agent and authorized humans; explain CV scores.
- Never expose Ollama publicly. First Admin/HR application decision wins; rejection reason stays internal; approval sends Magic Link.
- Run `npm run check` and DB tests before PR. No direct push to `main`.

## Status
Foundation, Agent Map, application form, RBAC, schema/RLS and CI are scaffolded. Next: Cloudflare variables, deploy migrations/functions, OAuth, authenticated modules, Google Drive, private Ollama gateway.
