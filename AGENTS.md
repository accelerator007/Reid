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
- Deployment state: critical V1 is deployed to Production and Staging. Git main commit `0edb0e6`, Cloudflare Worker Build `reid`, and Cloudflare Pages all passed. Migrations through `202609020002`, private CV Storage, Realtime, notifications, and Edge Function `decide-application` version 1 are deployed.
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

1. Join request, private CV upload, reviewer notifications, the review dialog, secure one-minute CV links, and Realtime refresh are deployed or implemented as recorded below. The expanded reviewer UI still needs an authenticated Owner browser test after its Staging deployment.
2. First-decision approval/rejection and approval Magic Link are deployed. Invitation delivery now has `pending/sent/failed` state and an Admin retry path, but still requires an authenticated Owner test and real SMTP delivery test. Secure one-click email decision links are still missing.
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

## Ordered delivery plan

The product must be released vertically: each phase includes database, RLS, UI, audit, notifications, responsive behavior, and automated tests. A later phase must not be presented as live before its vertical workflow passes.

### Phase 0 — security and account recovery

1. Rotate the previously exposed Google OAuth secret, store the replacement only in Supabase, and retest the callback.
2. Keep public registration application-only; approved applicants receive the invitation/Magic Link.
3. Configure company SMTP and Arabic Auth/application templates; test delivery to both Admin addresses.
4. Configure company-owned GitHub OAuth and Microsoft OAuth when the company tenant/client credentials exist.
5. Add encrypted weekly backup credentials and complete one documented restore drill.

### Phase 1 — operational company V1

1. Finish authenticated application review: details, private CV access, first-decision race, notifications, approval invitation, rejection audit, and secure email action links.
2. Build the authenticated shell and role-aware navigation for Profile, People, Projects, Research, Tasks, Calendar, Documents, Announcements, KPIs, Notifications, Timesheets, CRM, Agents, Approvals, and Settings.
3. Deliver Employees + departments + onboarding + announcements + timesheets as real workflows.
4. Deliver Projects + members + Kanban tasks + milestones + files + meetings + activity + KPIs + GitHub repository link.
5. Deliver Research + members + documents + datasets + experiments + ethics/approvals + publications/DOI/conference tracking.
6. Deliver CRM contacts/leads/pipeline for Admin, HR, and Sales.

### Phase 2 — governance and integrations

1. Add private HR, project, research, avatar, and general document buckets with file-level authorization.
2. Add authenticated RLS allow/deny integration tests to CI, plus accessibility, mobile visual, and performance checks.
3. Add error monitoring, uptime checks, retention policy, disaster-recovery runbook, and staging-data policy.
4. Enforce Owner-only Production merge authority in GitHub; current collaborator permission still prevents claiming this complete.

### Phase 3 — AI agents

1. Resume only when `ai-lap` is online; re-verify GPU/RAM, Ollama health, network reachability, and the exact installed model. Do not expose Ollama publicly.
2. Build a private authenticated gateway, queue, tool allow-lists, approval engine L0-L4, memory scopes, audit, pause/disable/manual run/replay, usage, latency, logs, and errors.
3. Activate agents incrementally: Knowledge/RAG first, then Operations/HR/Sales/Analytics, then the remaining V1 agents and CEO orchestration.
4. Connect Google Drive only after company authorization and enforce document ACLs before indexing.

## Verification log

### 2026-09-02 Dashboard route hotfix

- Confirmed the Production account `alialajmi524@gmail.com` already has the `Owner` role; the failure to open Admin was not an RBAC assignment problem.
- Root cause: Cloudflare interpreted the explicit `/dashboard /index.html 200` static redirect as a canonical redirect to `/`, discarding the application route and rendering the public homepage.
- Replaced static application redirects with a Worker asset fallback that serves `index.html` internally for the five known React routes before Cloudflare asset canonicalization, preserving the browser URL and retaining real 404 responses for unknown routes.
- Added automated coverage for Dashboard fallback, unknown-route 404, and the legacy privacy redirect. Production verification is recorded after deployment below.
- `npm run test`: pass; 8 tests. Production Worker version `a09b8338-3776-422d-9ab5-f4c146bddbad` deployed successfully.
- Live verification: `https://reidpro.com/dashboard` returns HTTP 200 with no redirect and the Reid app shell; an unknown URL returns HTTP 404.

### 2026-09-02 operational V1 alignment

- The authoritative onboarding workflow is now fixed as: public application → first Admin/HR decision → invitation/Magic Link on approval. Direct public account creation is removed from the UI to prevent bypassing company review.
- Login remains available for approved email/password accounts and configured OAuth providers. RLS remains the final authorization boundary even if an external OAuth identity is created.
- Added browser coverage proving the login page directs new people to the join workflow and no longer offers direct account creation.

### 2026-09-02 application review workspace

- Added a full Admin/HR application review dialog with contact, organization, requested scope, LinkedIn, GitHub, reason, cover letter, and private CV access through a signed URL that expires after 60 seconds.
- Added reviewer notification display and Realtime refresh for applications and notifications.
- Fixed partial invitation delivery: migration `202609020003` tracks `not_sent/pending/sent/failed`, error and delivery time independently from the atomic first decision. Failed invitations remain visible to reviewers and can be retried.
- Deployed migration `202609020003` and the updated `decide-application` Edge Function to Supabase. An unauthenticated retry request returned HTTP 401.
- Local `npm run check` passes with 8 tests and the Production build. Authenticated Owner/CV/decision/retry browser coverage remains required on Staging before release.
- Release-process correction: merging the `develop → main` release PR with automatic head deletion removed `develop`. The branch was immediately restored from current `main` (`17b5f59`). Never use `--delete-branch` when the release PR head is the persistent `develop` branch.

### 2026-09-02 account lifecycle completion

- Migration `202609020004` adds audited `active/suspended/disabled` account controls, backfills existing users, makes role mutation function-only, and enforces active-account checks in role, project, research, task, timesheet, notification, and profile-update policies.
- New `manage-account` Edge Function allows active Owner/Super Admin callers to assign non-Owner roles and suspend/reactivate non-Owner accounts. It blocks self-modification, Owner suspension/removal, unauthorized callers, and synchronizes suspension with Supabase Auth ban state.
- The Owner/Super Admin Dashboard now lists company accounts, multiple roles, status and reason, and provides protected role/status controls. Suspended users receive a dedicated access gate.
- Application notifications and future email buttons can deep-link to `/dashboard?review=<id>`; authentication plus RLS/RBAC are still required and the link never executes a decision itself.
- Remote migration and Edge Function deployment completed; an unauthenticated account-management call returned HTTP 401. Real Owner mutation tests must use a synthetic non-Owner account on Staging before Production.
- Outbound Arabic email remains blocked by missing SMTP provider credentials. Cloudflare Email Routing is not treated as an outbound SMTP service.
- Remote Supabase Auth public signup and email signup are now disabled through `supabase config push`; the authoritative application → approval → invitation flow is enforced at the Auth service, not only hidden in UI. Admin invitations remain the account-creation path.
- Approved accounts can request a Magic Link or password recovery without creating a new user (`shouldCreateUser: false`), and invited users can set an 8+ character password from their authenticated Profile.
- Arabic source templates for invite, Magic Link, recovery and confirmation are stored under `supabase/templates/`. Supabase refused hosted template activation on the Free plan with its default provider; activation requires custom SMTP or a paid plan. Existing remote confirmation, OTP length, MFA, redirects and Storage settings were preserved during config synchronization.

### 2026-09-03 Production account workflow release

- Released secure application review and account lifecycle management to Production through owner-approved PR `#26`; CI, build, Playwright, and Cloudflare Staging checks passed before merge.
- Production is served by the `reid` Worker rather than the `reid-staging` Pages project. The Git merge did not start a Worker build, so version `414f6037-1049-47c6-8690-521b5ff1980a` was deployed manually with the Supabase publishable client key and no service-role secret in the browser bundle.
- Live Owner verification for `alialajmi524@gmail.com` passed: the session resolves the `owner` role, `/dashboard` opens the Company Command Center, one pending synthetic application is visible, and Admin/HR review data is protected behind authentication.
- Corrected Google/Microsoft/GitHub OAuth return routing to `/dashboard`. Profile remains available through `حسابي / My profile`.
- Corrected the Owner account directory loader to fetch profiles, roles, and account controls independently and join them client-side. This avoids a PostgREST embedded-relationship failure that silently rendered an empty account list.
- Released the routing/directory correction through Staging PR `#28` and owner Production PR `#30`; CI and Cloudflare checks passed. Production Worker version `283e9c28-12fc-408f-aca0-c6aa0d8789ec` is live.
- Final authenticated browser verification passed on `https://reidpro.com/dashboard`: `Ali Alajmi / alialajmi524@gmail.com` appears as an active `owner`; Owner role removal, self-suspension, and role-add controls are disabled by design. The synthetic `Reid E2E Test` application remains pending for a deliberate decision test.
- Remaining deployment gap: permanent GitHub-to-Production Worker automation needs a scoped Cloudflare API token stored as a GitHub Actions secret. Creating that persistent credential requires explicit action-time authorization; until then Production deployment is manual.

### 2026-09-03 employee workspace implementation

- Work is active on `feature/employee-workspace-v1`; do not present this module as Production-ready until migration, authenticated role tests, Staging, and the release PR pass.
- Added migration `202609030001_employee_workspace.sql` for departments, profile employment fields, onboarding, calendar, announcements, private employee-document metadata/storage, KPIs, performance reviews, task writes, audit triggers, RLS, and Realtime feeds.
- Added the bilingual `/workspace` application route with role-aware navigation, company directory and individual employee view, onboarding checklist, assigned tasks, calendar, announcements, secure documents, KPIs/reviews, and timesheets-derived working hours. Payroll, leave, expenses, and attendance clock-in/out remain excluded.
- Owner/Admin/HR can manage employee operational records; an active employee can read the internal directory, update their assigned task state, complete their onboarding, manage their own calendar/documents/timesheets, and read only their own HR performance records.
- Staging OAuth verification exposed an exact-path allow-list gap: Google returned to the Production site instead of `staging.reidpro.com/workspace`. Auth redirect configuration now includes exact Profile, Dashboard, and Workspace paths for Production/Staging plus preview/local wildcards; retest after `supabase config push`.
- Auth redirect configuration was pushed and the second Google test returned correctly to `https://staging.reidpro.com/dashboard`; Owner navigation into `/workspace` passed with all employee modules visible.
- Live Staging writes passed for an onboarding item plus completion, an assigned task plus status update, a company calendar event, a bilingual announcement, a KPI, a performance review, and a 90-minute timesheet displayed as `1h 30m`. Records are clearly labeled `Staging` for audit visibility.
- Added migration `202609030002_employee_notifications.sql` and a Workspace notification center: task, onboarding, KPI, and announcement inserts notify the affected active employee; users can mark only their own notifications read.
- Private document upload could not be executed through Chrome because the ChatGPT extension lacks local-file access. The bucket, metadata RLS, signed URL UI, accepted MIME types, and size boundary exist, but upload/download remains an explicit Staging verification item.
- Employee V1 was released through owner Production PR `#36`; Cloudflare Worker version `d4b5b7fa-7896-4f11-8f74-b45d6fa0109e` is live. Authenticated Production verification at `/workspace` passed with the Owner identity, employee count, open-task count, 100% onboarding, `1h 30m` working hours, announcement, and calendar data.
- Post-release notification verification passed on Staging: a bilingual company announcement generated an employee-owned notification, the Workspace displayed it, and mark-read reduced the unread counter. Test operational records are intentionally labeled `Staging` and remain auditable.

### 2026-09-03 accounts and employees completion

- Work is active on `feature/accounts-employees-completion-v2`; do not claim final completion until separate Employee, HR, and department-manager sessions pass remote RLS tests and the release reaches Production.
- Added migration `202609030005_department_manager_scope.sql`. Department managers gain operational access only to direct reports' onboarding, tasks, private calendar items, KPIs, performance reviews, and timesheet summaries. HR documents, account controls, roles, company announcements, and department administration remain Owner/Admin/HR-only.
- The Workspace UI derives manager authority from `departments.manager_id`, scopes rows to the selected direct report, exposes operational forms only for authorized staff/managers, and prevents ordinary employees from showing an upload form for another employee.
- Cloudflare Email Sending Beta requires a paid Workers plan for arbitrary recipients; the free Email Routing path can send only to verified destinations. Supabase default SMTP is restricted and non-production, so applicant Magic Links require custom SMTP credentials or an approved paid sending service.
- Local verification passed on the first implementation: 10 Vitest checks, Production build, 7 Chromium public workflows, and linked migration dry run. The branch was rebuilt from current `develop` after resolving squash-history conflicts without replacing prior project work.
- PR `#44` passed CI and Cloudflare Pages and was merged into `develop`; migration `202609030005` was applied to Production Supabase and the remote schema lint is clean.
- Email authentication was found disabled in the live project and was explicitly enabled on 2026-09-03. Public self-signup remains disabled by design because accounts are issued only after an approved application; Email+Password and Magic Link are now available to issued users.
- The first separate-role remote test passed employee sign-in/timesheet creation and manager direct-report timesheet visibility, then correctly stopped on a real RLS mismatch: PostgREST could not return a manager-created task because the task SELECT policy omitted department managers. Migration `202609030006_manager_task_visibility.sql` adds manager/HR task visibility; it must be applied and the complete remote suite repeated before completion is claimed.

### 2026-09-03 project workspace implementation

- Work is active on `feature/project-workspace-v1`; do not present Projects V1 as Production-ready before migration, CI, authenticated Staging workflows, and the Production PR pass.
- Migration `202609030003_project_workspace.sql` extends projects with lifecycle, client, budget/currency, dates, archive and GitHub fields; adds milestones, meetings, KPIs, private file metadata and explicit user/role file permissions, activity feed, RLS helpers, audit triggers, notifications-ready task assignments, Realtime, and the private `project-files` bucket.
- Added bilingual `/projects` and `/projects/:id` routes. The project directory supports all five types and archived filtering; each project has its own dashboard, team/manager controls, settings, Kanban, milestones, meetings, files, KPIs, activity and GitHub link.
- Project access is scoped by Admin, project manager/lead, or membership. Managers control the project and team; ordinary members can read project data and only use permissions granted by task/file policies. Restricted files require an explicit user/role grant in addition to project membership.
- Restricted-file controls now let a project manager grant and revoke read or read/write access per user, or read access per company role, directly from the project dashboard. `/projects` was also added to the Worker SPA allow-list while unknown routes retain edge 404 behavior.
- Validation caught and corrected two permission-model mismatches before migration: permission rows now have stable UUIDs for safe revocation, each grant records the authenticated granter, and role choices exactly match the database enum.
- Local verification passed: 10 Vitest checks, the TypeScript/Vite Production build, and 7 Chromium workflows including anonymous denial for `/projects` and `/projects/:id`. The linked migration dry run lists only `202609030003`, remote schema lint reports no errors, and the migration has not yet been applied pending PR/CI validation.
- PR `#39` passed both CI jobs and Cloudflare Pages, was merged into `develop`, and migration `202609030003` was applied remotely. First authenticated Owner creation test exposed `record "new" has no field "project_id"` in the generic activity trigger; no project row was created. Corrective migration `202609030004` resolves identifiers through JSON for parent and child records and must pass the repeated Staging workflow before Production.
- Corrective migration `202609030004` is now applied and lint-clean. The repeated authenticated Owner flow created `Staging Project V1` successfully with product type, manager membership, OMR 12,500 budget, client, dates and GitHub link; Kanban task creation/move, milestone, meeting, KPI, and the attributable activity feed all passed.
- Staging project update from `planning` to `active` passed, as did archive and immediate unarchive. Private upload verification reached the native file handoff but Chrome denied the extension access (`Not allowed`); no file or metadata row was created. The private bucket, MIME/size limits, signed URL flow, and per-user/per-role RLS remain implemented, but browser upload/download is still an explicit manual verification item until Chrome file access is enabled.

### 2026-09-02 critical V1 implementation verification

- `npm run check`: pass; 5 tests, TypeScript build, and Vite production build.
- `npm run test:e2e`: pass; 4 Chromium workflows covering bilingual home/chat/WhatsApp, anonymous dashboard denial, join-form validation, privacy, and 404.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Vite output contains `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml`.
- Staging deployment `f434ae6`: Cloudflare and CI passed; live Chromium verified anonymous Dashboard denial and privacy rendering; fresh `robots.txt` is `text/plain`, `sitemap.xml` is XML, and CSP/HSTS/X-Frame-Options/Permissions-Policy/Referrer-Policy/X-Content-Type-Options are present.
- Supabase CLI authenticated as the company account; migration history was reconciled to the already-existing schema, migration `202609020001` was applied, and Edge Function `decide-application` version 1 is ACTIVE. Migration `202609020002` backfills Owner/Admin roles for approved accounts created before the bootstrap trigger.
- Live Staging onboarding passed using synthetic identity `reid-e2e-1788330139887@example.com`: application insert succeeded and a synthetic PDF CV uploaded to the private bucket. The test record is retained for the Owner's first Dashboard decision test.
- An unauthenticated `decide-application` request returned HTTP 401 (`Missing authorization header`), confirming the function is not callable without a session.
- Production Worker build failure was traced to Cloudflare rejecting the wildcard SPA `_redirects` rule as an infinite loop (API code `100324`). The rule was replaced with explicit application routes, which also restores a real edge 404 for unknown paths.
- Production was deployed manually to Worker `reid`, version `2c51371b-4e23-48ed-bfc4-5b3aab62b393`, after a successful Wrangler dry run. Live verification found the new bundle markers, HTTP 404 for unknown routes, correct robots/sitemap content types, and CSP/HSTS/frame/content-type/referrer/permissions headers.
- The follow-up connected Worker Build for Git commit `0edb0e6` completed successfully, proving future Git-to-Production deployment is repaired rather than only manually recovered.
- Owner account verification found one profile and one `user_roles` row in Production. The profile UI was corrected to display role badges and navigate to Dashboard after a successful LinkedIn/profile save; the previous UI silently remained on Profile even when Owner authorization existed.
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
