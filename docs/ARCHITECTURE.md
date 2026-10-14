# Architecture

Current as reviewed 2026-10-14. [AGENTS.md](../AGENTS.md) is the current engineering handoff; the [release archive](history/ENGINEERING_STATUS_THROUGH_20261013.md) preserves historical states.

The React/Vite bilingual client is served by the `reid-web` Docker container on the Reid Ubuntu host. Cloudflare Tunnel publishes `reidpro.com`; nginx routes `/api/` to the private host service. Supabase project `cfxntjnewkmlvkogfxyu` supplies Auth, Postgres/RLS, private Storage, Realtime and Edge Functions. The former Worker/old project are historical infrastructure, not the current production origin.

The host service authenticates Owner/Super Admin sessions before administrative APIs. Database RPCs independently authorize authenticated callers. Customer messages never grant employee permissions. A customer journey links CRM, request, task and project records; raw WhatsApp content and the link table stay Owner-only. Assigned employees receive only the authorized task/request.

Local AI runs on the physical ai-lap via a restricted private SSH tunnel to an authenticated adapter. Browser requests never reach Ollama or service credentials. The local chat runtime bounds inference, measures content-free usage and opens a short circuit after repeated failures. It never routes internal content to an external provider on failure.

Modules: public site; identities/applications; people; projects; research; CRM; tasks/requests; workshops/forms; documents; notifications; scoped agent tools/approvals; WhatsApp; and Connections. Meetings depend on separately configured Google OAuth, Recall and live listening/voice services. Configuration readiness is distinct from a tested live meeting.
