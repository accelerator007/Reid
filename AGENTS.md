# Reid Engineering Agent Guide and Permanent Status

This is the primary handoff file for ChatGPT, Claude, Codex, and human engineers. Read it before changing the repository. It records architecture, rules, verified state, known defects, and the next work.

## Mandatory status-update rule

Every change must update this file before its PR is merged. At minimum update:

1. `Last verified` date and relevant commit/deployment.
2. `Implemented and verified` for newly working behavior.
3. `Known defects and missing work` when anything remains incomplete.
4. `Verification log` with the commands and real workflows tested.

Never mark a feature complete because its UI exists. Complete means the UI, database/API, authorization, notifications, error handling, and tests work together in Production or Staging as stated. Do not remove an open item without evidence.

## Mission and identity

- Company name: `ريّد` in Arabic and `Reid` in English.
- `COR` is a project name, not the company name.
- Public domain: `https://reidpro.com`.
- Staging domain: `https://staging.reidpro.com`.
- UI: bilingual Arabic/English, RTL/LTR, purple identity, light/dark, responsive, Apple-like.
- Repository: `https://github.com/accelerator007/Reid` (public).

## Stack and environments

- Client: React 19, Vite 7, TypeScript.
- Data/auth: Supabase project `Reid`, ref `pkogchbrknwmzefjklkr`, Mumbai region.
- Database: PostgreSQL with RLS, audit triggers, and pgvector.
- Production hosting: Cloudflare Worker `reid` with static assets, Git-connected to `main`, custom domain `reidpro.com`.
- Staging hosting: Cloudflare Pages project `reid-staging`, Git-connected to `develop`, custom domain `staging.reidpro.com`.
- Branches: `feature/*` -> PR to `develop` -> verified PR to `main`.
- Local AI: Ollama on `ai-lap`, model name verified as `gemma4:12b`. The host was offline during the 2026-09-02 audit; never claim live AI integration until it is retested.

## Critical paths

- App entry: `src/main.tsx`.
- Supabase browser client: `src/supabase.ts`.
- Authorization policy helpers: `src/policy.ts`.
- UI styling: `src/style.css`, `src/auth.css`, `src/profile.css`.
- Database migrations: `supabase/migrations/`.
- Database pgTAP draft: `supabase/tests/rls.sql`.
- CI: `.github/workflows/ci.yml`.
- Backup workflow: `.github/workflows/weekly-backup.yml`.
- Deployment documentation: `DEPLOYMENT.md`.
- Security and permissions: `SECURITY.md`, `PERMISSIONS.md`.

## Security and engineering rules

- Never commit secrets, database passwords, OAuth secrets, service-role keys, tokens, CVs, HR files, or production exports.
- Browser code may contain only the Supabase publishable key. Never expose the service-role key.
- Enable and test RLS before exposing a table to the client.
- HR files/CVs are limited to authorized humans and the HR agent. CV scoring must be explainable.
- Never expose Ollama or port `11434` directly to the internet.
- Approval levels: L0 read/analyze; L1 drafts/tasks; L2 configurable approval for external publish/email; L3 human approval for hiring/contracts/finance; L4 Owner approval and future MFA for payments/critical deletion.
- The first Admin/HR decision must atomically finalize an application. Rejection reasons remain internal. Approval sends a Magic Link.
- Work on `feature/*`. Run checks before PR. Do not push directly to `main`.
- Preserve the public website identity and bilingual behavior. Do not rename the company to COR.
- When changing schema, add a migration; do not edit an already-applied migration.
- Use accessible labels, keyboard behavior, loading/error states, and mobile QA for every new UI workflow.

## Roles and intended permissions

Users may have multiple roles: Owner, Super Admin, Admin, HR, Sales, Employee, Project Member, Research Member, Guest/External Collaborator.

- Owner: strategic authority and L4 approvals.
- Super Admin/Admin: administration and scoped approvals.
- HR: applications, employees, onboarding, HR-only documents.
- Sales: CRM access and sales agent workflows.
- Employee: own profile, assigned work, documents, timesheets.
- Project/Research members: only assigned project/research scope.
- Guest/external collaborators: only explicitly shared resources.

The intended matrix exists in policy/schema form only. End-to-end enforcement is not yet complete.

## Agents

V1 agents: CEO/Orchestrator, Operations, Marketing, Content/Social, Sales/CRM, Analytics, Knowledge, HR, Finance, Customer Support, Competitor Intelligence. All use `gemma4:12b`, but require different prompts, tools, permissions, and memories. Memory scopes are User, Project, Department, Company, and Agent.

The current Agent Map is a visual mock with hard-coded states. There is no live Ollama gateway, queue, agent execution, pause/replay, latency, token usage, or error stream yet.

## Implemented and verified

Last verified: 2026-09-02, Asia/Muscat.

### 2026-09-02 critical V1 implementation (feature branch)

- Public join form now validates and inserts a real `applications` row instead of showing unconditional success.
- Optional CV upload is limited to PDF/5 MB and targets the private `application-cvs` bucket; failed inserts clean up the uploaded object.
- New migration creates private CV storage policies, `notifications`, audit trigger, reviewer notifications, Realtime publication entries, and atomic `decide_application` RPC.
- New `decide-application` Edge Function validates the caller, executes the first-decision RPC, and sends an Auth invitation/Magic Link on approval.
- Dashboard now requires an authenticated user, completed LinkedIn profile, and Owner/Super Admin/Admin/HR role. KPIs, applications, and agents load from Supabase instead of hard-coded dashboard values.
- OAuth profile completion is enforced before workspace access. GitHub is now present in the login UI; provider activation still requires company OAuth credentials.
- The 20-minute inactivity logout is installed in the application and covered by two tests.
- Browser routes, bilingual privacy content, `robots.txt`, `sitemap.xml`, SPA redirects, and deployable security headers were added under `public/`.
- Local Supabase Auth configuration now matches the verified remote public-signup behavior and Storage default is 5 MB.
- Local verification passes with 5 unit tests, 4 Chromium E2E tests, TypeScript, Vite build, and 0 npm vulnerabilities.
- Deployment state: application commit `f434ae6` is deployed to Staging. Migrations through `202609020002`, private CV Storage, Realtime, notifications, and Edge Function `decide-application` version 1 are deployed. Production promotion is proceeding through the protected PR workflow.
### Repository and delivery

- Repository is public; default branch is `main`.
- `main` branch protection requires the `test` status, current branch, PR flow, linear history, resolved conversations, and blocks force pushes/deletion.
- Production release commit: `6528542`.
- Develop commit audited: `e7a4171`.
- Recent GitHub CI runs for feature, develop, and production PRs passed.
- `npm run check` passes: 3 unit tests plus TypeScript/Vite production build.
- `npm audit --audit-level=high` reports 0 vulnerabilities.
- Repository secret scan found only empty placeholders in `.env.example`, not real committed secrets.

### Cloudflare

- `reidpro.com` returns HTTP 200 and current Reid React application.
- `staging.reidpro.com` returns HTTP 200 and follows `develop`.
- Production and Staging builds are independent.
- Production bundle contains the Supabase URL, browser-safe publishable key, and WhatsApp number.
- WhatsApp handoff targets `+968 97308003`.

### UI

- Arabic shows `ريّد`; English shows `Reid`.
- Language switch changes navigation and hero content.
- Light/dark toggle exists.
- Login and account-creation views render.
- Email/password login is wired to Supabase Auth.
- Registration requires full name, email, password (minimum 8), and a LinkedIn URL; GitHub is optional.
- Profile form reads/writes basic profile fields through Supabase.
- Homepage assistant opens, responds with local rule-based replies, and produces a valid WhatsApp handoff.
- Agent Map, KPI cards, join form, and profile UI render, but several are mock-only as listed below.

### Supabase

- Remote Auth settings verified: email enabled, Google enabled, Microsoft/Azure disabled, signups remotely enabled, email confirmation required.
- Google OAuth client is connected to `https://pkogchbrknwmzefjklkr.supabase.co/auth/v1/callback`, published for external Google accounts, and the OAuth redirect starts without `invalid_client`.
- Site URL is `https://reidpro.com`.
- Redirect allow list includes Production, Staging, Pages staging, and local development.
- Database audit found 14 public tables; all 14 have RLS enabled.
- Database audit found 16 RLS policies.
- Audit triggers exist for the audited tables; `information_schema` reports 39 event rows (insert/update/delete events).
- `profiles.linkedin_url`, `applications.linkedin_url`, GitHub fields, profile trigger, and self-update policy were applied.
- pgvector is installed and the memory embedding column exists.
- Database currently has 0 auth users, 0 profiles, 0 applications, 0 projects, 0 tasks, 0 CRM contacts, and 0 agent runs. It has 11 audit rows from setup activity.

## Known defects and missing work

### P0 — blocks a trustworthy V1

1. Join request, private CV upload, and reviewer notifications are deployed; the real Staging join/CV workflow passed. Reviewer notification display still needs an authenticated UI test.
2. First-decision approval/rejection and approval Magic Link are deployed but still require an authenticated Owner test and real SMTP delivery test. Secure one-click email decision links are still missing.
3. Dashboard authentication, LinkedIn completion, RBAC, live counts, applications, and agent rows pass anonymous-denial testing; authenticated Owner behavior still needs final Production verification.
4. Microsoft login is displayed but Supabase Azure is disabled. Do not create it inside the available Sohar University tenant; use a company-owned Microsoft tenant.
5. GitHub login is implemented in UI but its Supabase provider and company OAuth app are not configured.
6. Google OAuth LinkedIn completion is enforced in code but is not yet released to Production.
7. The 20-minute inactivity timeout is enforced in code and tested, but is not yet released to Production. Supabase JWT expiry remains 60 minutes.
8. Public signup is now authoritative and local `supabase/config.toml` is aligned; remote re-verification remains required after release.
9. Custom SMTP is disabled. Cloudflare Email/SMTP, Arabic templates, Admin notifications, and reliable Auth email delivery are not configured.
10. Weekly backup cannot run: GitHub has no `SUPABASE_DB_URL` Actions secret. There is no successful backup/restore test.
11. `robots.txt`, `sitemap.xml`, privacy route, and in-app 404 were added, but production content types/status behavior must be verified after deployment; SPA unknown routes still use HTTP 200 at the edge.
12. Security headers are now emitted from `public/_headers`; Production header verification remains required because Worker static-asset handling may differ from Pages.
13. Owner-only Production merging is not fully enforced. Collaborator `sheikhaalmamari4-cyber` currently has `write` permission, and main protection requires zero approvals; a writer could merge a passing PR.
14. A Google OAuth client secret appeared in an automation tool transcript during setup. It is not committed to Git, but it should be rotated and the replacement stored only in Supabase after explicit credential-rotation confirmation.

### P1 — core modules are schema/mock only

- No authenticated application shell or URL router/deep links.
- No real employee directory, departments, onboarding, announcements, calendar, documents, KPI/performance, notifications, or timesheet UI/API.
- No working project dashboards, Kanban, milestones, meetings, budgets, file-level permissions, clients, GitHub integration, activity, or project agents.
- No working research workflows, datasets, experiments, ethics/approvals, publication/DOI/conference tracking, or AI research assistant.
- No working CRM UI, lead pipeline, Sales permissions E2E, or Sales agent.
- CV Storage, three Realtime tables, and the decision Edge Function are deployed. Project, research, HR, and avatar buckets/policies are still missing.
- RAG/Knowledge Agent, Google Drive synchronization, embeddings pipeline, and document ACL filtering are not implemented.
- No Operations/HR/Finance/Marketing/Support/Analytics/Competitor agent execution.
- No daily/weekly executive report generation or weekly email delivery.
- No live admin controls for pause, disable, manual run, failed-task replay, queues, logs, tools, memory, KPIs, latency, or token usage.
- No private gateway between Cloudflare/Supabase and `ai-lap`; `ai-lap` was offline during the latest audit.

### P2 — quality and operations

- Five unit tests and four public-browser E2E tests exist. Authenticated Auth/RLS/database/email/storage workflows still lack executable integration coverage.
- `supabase/tests/rls.sql` has 5 schema checks but is not run by GitHub CI and does not impersonate roles to test allow/deny behavior.
- A Chromium public-flow E2E suite exists; authenticated E2E, accessibility automation, mobile visual regression, performance budgets, error monitoring, and uptime alerts remain missing.
- No tested recovery procedure, restore drill, staging data policy, retention policy, or disaster recovery evidence.
- Legacy static files and COR-era assets remain in the repository and should be deliberately migrated or removed only after confirming which historical project pages are still required.
- Documentation files other than this status have stale claims, including hosting details and OAuth progress. Update them alongside implementation.

## Required next-work order

1. Rotate the exposed Google OAuth secret and retest Google callback.
2. Decide onboarding authority: public account creation versus application approval. Enforce one consistent model.
3. Implement the real application/CV/notification/approve-reject/Magic-Link workflow with E2E tests.
4. Protect dashboard and profile-completion routes with session and RBAC guards; enforce 20-minute inactivity logout.
5. Configure company SMTP and Arabic templates; run real delivery tests to both Admin addresses.
6. Add company-owned Microsoft OAuth and GitHub OAuth; test complete callbacks.
7. Fix public routing, privacy, robots, sitemap, 404 behavior, and production security headers.
8. Configure encrypted weekly backups and complete a restore drill.
9. Add storage buckets and file policies for CVs, HR, project, research, and avatar files.
10. Build modules incrementally with RLS integration tests, then connect live agents after `ai-lap` is online.

## Verification log

### 2026-09-02 critical V1 implementation verification

- `npm run check`: pass; 5 tests, TypeScript build, and Vite production build.
- `npm run test:e2e`: pass; 4 Chromium workflows covering bilingual home/chat/WhatsApp, anonymous dashboard denial, join-form validation, privacy, and 404.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Vite output contains `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml`.
- Staging deployment `f434ae6`: Cloudflare and CI passed; live Chromium verified anonymous Dashboard denial and privacy rendering; fresh `robots.txt` is `text/plain`, `sitemap.xml` is XML, and CSP/HSTS/X-Frame-Options/Permissions-Policy/Referrer-Policy/X-Content-Type-Options are present.
- Supabase CLI authenticated as the company account; migration history was reconciled to the already-existing schema, migration `202609020001` was applied, and Edge Function `decide-application` version 1 is ACTIVE. Migration `202609020002` backfills Owner/Admin roles for approved accounts created before the bootstrap trigger.
- Live Staging onboarding passed using synthetic identity `reid-e2e-1788330139887@example.com`: application insert succeeded and a synthetic PDF CV uploaded to the private bucket. The test record is retained for the Owner's first Dashboard decision test.
- An unauthenticated `decide-application` request returned HTTP 401 (`Missing authorization header`), confirming the function is not callable without a session.
- Static secret scan: no committed credential found; Edge Function references runtime-managed `SUPABASE_SERVICE_ROLE_KEY` only.
- Supabase remote migration/function deployment is complete through `202609020002`; CLI authentication succeeded through the company account.
- GitHub collaborator downgrade was requested twice through the official API, but GitHub retained `sheikhaalmamari4-cyber` at `write`; Owner-only merge enforcement therefore remains open and was not falsely marked complete.
- `ai-lap`: intentionally not touched; host remains out of scope while offline.
### 2026-09-02 comprehensive audit

- `npm run check`: pass; 3 tests, TypeScript build, Vite build.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- GitHub Actions: recent feature/develop/main CI runs passed.
- Production HTTP/title: pass (`200`, `Reid | ريد`).
- Staging HTTP/title: pass (`200`, `Reid | ريد`).
- Arabic/English branding and navigation: pass.
- Login/create-account fields and HTML validation: pass.
- Google OAuth initiation: pass; full account creation/callback/profile completion not executed.
- Microsoft provider: fail/not configured (`external.azure=false`).
- Homepage assistant and WhatsApp URL: pass.
- Public SEO/legal/404 routes: fail; React fallback returned.
- Supabase introspection: 14/14 public tables with RLS, 16 policies, audit triggers present, profile social columns present.
- Supabase Storage: 0 buckets. Realtime publication: 0 public tables.
- Custom SMTP: disabled.
- GitHub backup secret: missing; backup workflow not operational.
- `ai-lap`: not tested because host was reported offline.

## Definition of done

A workflow is done only when its happy path, denial path, validation errors, RBAC/RLS, audit log, notification, responsive UI, and automated tests pass in Staging; Production is deployed through a protected PR; and this file is updated with exact evidence and remaining limitations.
