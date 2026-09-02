# Architecture
Reid is a bilingual React/Vite client hosted by the existing Cloudflare Pages project `reid`, backed by Supabase Postgres/Auth/Storage/Realtime/Edge Functions. `main` is production, `develop` is staging, and `feature/*` receives preview deployments. Local agents run only on `ai-lap` through a private Ollama gateway; browsers never receive direct Ollama or service-role access.

Modules: public site, identity/RBAC, applications, people, projects, research, CRM, tasks/timesheets, documents, notifications, and agent control. Supabase pgvector stores RAG embeddings; Google Drive ingestion is disabled until OAuth is connected.
