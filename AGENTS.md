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
- Model providers are rows in `llm_providers`, not hard-coded hosts. `ollama` (local, `ai-lap`) is the preferred provider and ships disabled; `gemini` (external, Google Gemini API) is enabled as the temporary substitute while `ai-lap` is offline.
- The Gemini account is on the **free tier**, confirmed by the Owner on 2026-09-04. Free-tier content may be reused to improve Google products, so the provider is capped at `public` data: only material that is already publishable may be sent. Raising the cap requires a paid tier and a recorded Owner decision.
- Local AI: Ollama on `ai-lap`. The host was offline during the 2026-09-02 audit; never claim live AI integration until it is retested. The Gemma 4 family exists (the Gemini API lists `gemma-4-26b-a4b-it` and `gemma-4-31b-it`), but the exact `gemma4:12b` Ollama tag must be confirmed on the host before the local provider is enabled.

## Critical paths

- App entry: `src/main.tsx`.
- Supabase browser client: `src/supabase.ts`.
- Authorization policy helpers: `src/policy.ts`.
- UI styling: `src/style.css`, `src/auth.css`, `src/profile.css`.
- Agent gateway Edge Function: `supabase/functions/llm-gateway/index.ts`.
- Agent gateway client and policy: `src/agents.ts`, `src/agent-command.tsx`.
- Route manifest shared by the app and the Worker: `src/routes.ts`.
- Typed data boundary and bilingual error mapping: `src/db.ts`.
- Authenticated shell, access states and the single gate: `src/shell.tsx`.
- Design tokens, the only file that names a colour: `src/tokens.css`.
- Archived pre-React marketing content: `content/legacy/` (built by nothing, served by nothing).
- Database migrations: `supabase/migrations/`.
- Database pgTAP draft: `supabase/tests/rls.sql`.
- Executable RLS allow/deny harness: `scripts/rls-local.sh`, `supabase/tests/local/`.
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
- Model provider credentials are Edge Function secrets only. Never place a provider key in a `VITE_*` variable, because those are compiled into the public browser bundle, and never commit one to this public repository.
- An external model provider may only receive data at or below its `max_classification`. HR, CV, finance, and CRM data are `confidential` or `restricted` and must never leave company control while only an external provider is enabled.
- Approval levels: L0 read/analyze; L1 drafts/tasks; L2 configurable approval for external publish/email; L3 human approval for hiring/contracts/finance; L4 Owner approval and future MFA for payments/critical deletion.
- The first Admin/HR decision must atomically finalize an application. Rejection reasons remain internal. Approval sends a Magic Link.
- Work on `feature/*`. Run checks before PR. Do not push directly to `main`.
- Preserve the public website identity and bilingual behavior. Do not rename the company to COR.
- When changing schema, add a migration; do not edit an already-applied migration.
- Read Supabase through `src/db.ts`. Never write `(result.data || [])`: it discards the error object, so an expired session, a network drop and an empty table all render as the same blank panel.
- Never write a colour literal or a raw `border-radius` value in a component stylesheet. Use a token from `src/tokens.css`; `tokens.test.ts` fails the build otherwise, and every token needs a dark counterpart unless it is a named exemption.
- Read the session through `useSession()`. Roles, suspension and profile completion are resolved once by `src/shell.tsx`; a component that re-reads `user_roles` for the current user is a bug.
- Guard a page with `<Guarded>`, and declare who may open it in the route's `allow` list. Never hand-roll a gate: `routes.contract.test.ts` and `shell.test.ts` require every authenticated route to declare its roles, and prove the navigation never offers what the gate would refuse.
- Add a route only in `src/routes.ts`. Both `src/main.tsx` and `src/worker.ts` derive from it, and `src/routes.contract.test.ts` fails if a path the app renders is not served by the edge.
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

V1 agents: CEO/Orchestrator, Operations, Marketing, Content/Social, Sales/CRM, Analytics, Knowledge, HR, Finance, Customer Support, Competitor Intelligence. Each resolves its model from its provider row rather than a hard-coded name, but they require different prompts, tools, permissions, and memories. Memory scopes are User, Project, Department, Company, and Agent.

The Agent Map is no longer a visual mock. `supabase/functions/llm-gateway` is the private gateway: it verifies the session, applies `agents_admin_read` RLS, enforces approval levels L0-L4, refuses any run whose data classification exceeds the provider's clearance, rate-limits per caller, and records every attempt in `agent_runs` with latency, token usage, and errors. Prompts are stored only as a SHA-256 hash; answers are kept as a 280-character preview.

Agents carry a data classification, and only those at or below the enabled provider's ceiling start enabled:

| Classification | Agents | Status on the free-tier Gemini row |
| --- | --- | --- |
| `public` | Marketing, Content/Social, Competitor Intelligence | enabled |
| `internal` | Operations, Analytics, Knowledge, Support, CEO/Orchestrator | disabled |
| `confidential` | Sales/CRM | disabled |
| `restricted` | HR, Finance | disabled |

Only the three `public` agents run today. The `internal` five unlock by moving the Gemini account to a paid tier and raising `max_classification` to `internal`; the `confidential` and `restricted` agents unlock only on the local `ollama` provider. Enablement is derived from `provider_accepts`, and the `agent_runs_clearance` trigger enforces it in the database rather than in the gateway alone.

## Implemented and verified

Last verified: 2026-09-04, Asia/Muscat.

### 2026-09-04 agent gateway (feature branch, not yet deployed)
- Migration `202609040002_agent_gateway.sql` adds `llm_providers`, provider/classification/enabled columns on `agents`, run lifecycle and approval columns on `agent_runs`, the `provider_accepts` clearance function, the `agent_runs_clearance` trigger, the `approve_agent_run` RPC, Owner-only provider writes, and Realtime on `agent_runs`.
- Edge Function `llm-gateway` dispatches to Gemini or Ollama behind one provider-agnostic interface, so restoring `ai-lap` is a provider row change rather than a rewrite.
- The dashboard Agent Map is replaced by `AgentCommand`: provider clearance display, manual run, pause/resume, disable/enable, approval decisions for L2+ runs, and a run stream with latency, tokens, output preview, and errors.
- `supabase/tests/local/rls_agents.sql` adds 30 executable allow/deny checks that CI runs against a real PostgreSQL 16 with every migration applied, so the clearance rule, the roster scoping, the admin controls and the approval engine are proven by the database rather than by the UI.
- 8 new unit tests cover the clearance and approval policy.
- Not deployed and not executed against a live provider. See the P0 list below.

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
15. A Gemini API key was pasted into an assistant transcript on 2026-09-04. The Owner accepted the exposure and asked for it to be applied. It is stored only in the gitignored `.dev.vars` and was never committed. It must be rotated, and the replacement set with `supabase secrets set GEMINI_API_KEY=...` only.
16. The Gemini account is on the free tier, so the provider is capped at `public` and the five `internal` agents (Operations, Analytics, Knowledge, Support, CEO) are disabled. Moving to a paid tier and raising the cap to `internal` is the smallest change that activates them.
17. Migration `202609040002_agent_gateway.sql` and the `llm-gateway` function have not been applied or deployed to Staging or Production. The RLS policies, the clearance trigger and the approval engine are proven locally by `rls_agents`, but no request has passed through the Edge Function itself, so the gateway's session handling, rate limiting and provider dispatch remain untested against real traffic.
18. Model availability on this key is narrower than the API's own model list. `gemini-2.5-flash` and `text-embedding-004` are listed by ListModels but rejected at call time, so a provider row must be verified by a real call, never by the listing.

### P1 — core modules are schema/mock only

- The authenticated shell, role-aware navigation, route manifest, typed data boundary and design tokens are in place, and the employee, projects and research modules read the session through `useSession()` and report failures through `src/db.ts`. Their remaining direct writes still call Supabase without the data layer, and the three files are each over 1,000 lines and have not been split into feature folders.
- No real employee directory, departments, onboarding, announcements, calendar, documents, KPI/performance, notifications, or timesheet UI/API.
- No working project dashboards, Kanban, milestones, meetings, budgets, file-level permissions, clients, GitHub integration, activity, or project agents.
- Research V1 (members, datasets, experiments, ethics/approvals, publications/DOI/conference tracking, private documents with per-user/per-role grants, tasks, activity) is merged to `develop` and proven by 79 local RLS allow/deny checks. Migration `202609040001` is **not applied to remote Supabase**, so the module cannot work against Staging or Production yet, and no authenticated browser session has verified it. The AI research assistant remains unimplemented.
- No working CRM UI, lead pipeline, Sales permissions E2E, or Sales agent.
- CV Storage, three Realtime tables, and the decision Edge Function are deployed. The `project-files` and `research-files` buckets and policies exist in migrations; the research bucket is not yet applied remotely. Avatar and general-document buckets are still missing.
- RAG/Knowledge Agent, Google Drive synchronization, embeddings pipeline, and document ACL filtering are not implemented.
- Agent execution, admin controls, and the private gateway are implemented on `claude/agent-plan-7v3s5l` and proposed in PR #58, but not deployed, so no agent has completed a real run yet.
- No daily/weekly executive report generation or weekly email delivery.
- Tool allow-lists, per-agent system prompts, and memory-scope retrieval are not implemented; the gateway currently passes the caller's text straight through.
- No queue worker: L2+ runs stop at `pending_approval` and an approved run is not automatically dispatched afterwards.
- `ai-lap` was offline during the latest audit, so the local provider remains disabled and unverified.

### P2 — quality and operations

- Twenty-one unit tests, eight public-browser E2E tests, and 109 database RLS allow/deny checks exist (79 research, 30 agent gateway). Authenticated Auth/email/storage workflows still lack executable integration coverage, and the RLS harness proves policy behaviour against a local database rather than against the remote Supabase project.
- `supabase/tests/rls.sql` is still a schema-shape draft (38 checks) that CI does not run, because pgTAP is not installed in the harness. Role impersonation is now covered instead by `scripts/rls-local.sh`, which applies every migration to a throwaway PostgreSQL 16 database and runs 79 allow/deny checks as real `anon`/`authenticated` roles in its own CI job. The Research workspace and the agent gateway have such suites; Employee, Projects, Applications, and account-lifecycle suites are still missing.
- A Chromium public-flow E2E suite exists; authenticated E2E, accessibility automation, mobile visual regression, performance budgets, error monitoring, and uptime alerts remain missing.
- No tested recovery procedure, restore drill, staging data policy, retention policy, or disaster recovery evidence.
- Legacy COR-era pages are archived under `content/legacy/` with a README. Their titles still read "| COR" and they are not reachable; they need to become real bilingual routes before the directory is deleted.
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
5. Deliver Research + members + documents + datasets + experiments + ethics/approvals + publications/DOI/conference tracking. Merged to `develop` and covered by 79 local RLS checks. The remote migration has not been applied and no authenticated Staging verification has run, so this is not complete.
6. Deliver CRM contacts/leads/pipeline for Admin, HR, and Sales.

### Phase 2 — governance and integrations

1. Add private HR, project, research, avatar, and general document buckets with file-level authorization.
2. Add authenticated RLS allow/deny integration tests to CI, plus accessibility, mobile visual, and performance checks.
3. Add error monitoring, uptime checks, retention policy, disaster-recovery runbook, and staging-data policy.
4. Enforce Owner-only Production merge authority in GitHub; current collaborator permission still prevents claiming this complete.

### Phase 3 — AI agents

1. Deploy the agent gateway to Staging, run the `public` and `internal` agents end to end, and verify audit rows, latency, token accounting, rate limiting, and the L2+ approval path with a real Owner session.
2. Add the queue worker that dispatches an approved L2+ run, plus tool allow-lists, per-agent system prompts, and memory-scope retrieval.
3. Enable the local provider only when `ai-lap` is online; re-verify GPU/RAM, Ollama health, network reachability, and the exact installed model, then raise the confidential and restricted agents onto it. Do not expose Ollama publicly.
4. Activate agents incrementally: Knowledge/RAG first, then Operations/Analytics/Support, then Sales and HR once the local provider carries them, then CEO orchestration.
5. Connect Google Drive only after company authorization and enforce document ACLs before indexing.

## Verification log

### 2026-09-04 feature modules moved onto the shell

- `employee.tsx`, `projects.tsx` and `research.tsx` each resolved their own roles and reported failures by printing the raw Postgres string. Session-scoped reads of `user_roles` are now **one**, in `src/shell.tsx`; the read remaining in `main.tsx` is the admin listing of every account's roles, which carries no user filter and is a different query.
- Their parallel loads report through `firstError` and `messageFor`, so a reader sees a bilingual, actionable message instead of `new row violates row-level security policy for table ...`, and an expired session is named ahead of the failures it caused.
- `shell.test.ts` now scans every module for a session-scoped `user_roles` read and fails if one returns, which was verified by reintroducing the query and watching the test catch it. It also asserts the shell still performs that read, so the check cannot pass vacuously.

### 2026-09-04 design tokens (feature branch)

- The stylesheets held six variables and **85 hard-coded colours**: roughly seventeen shades of purple doing the work of three, six greens, five reds and two ambers. The dark theme was defined in one file, so all 85 literals stayed frozen at their light values when the theme flipped.
- `src/tokens.css` is now the only file that names a colour. A seven-step brand ramp built on `#55418b`, the value already in the `theme-color` meta tag, plus semantic `good`/`warn`/`risk` families kept deliberately separate from the brand so a warning and a button cannot look alike. Radii collapsed from twelve values, including two spellings of "pill", onto a six-step scale across 51 declarations.
- `tokens.test.ts` enforces it: no component stylesheet may contain a colour literal, every token referenced must exist, and every colour token needs a dark counterpart unless it is a named exemption. The 500 and 700 brand steps are exempt because they are fills carrying white `--on-brand` text and stay deep on either ground.
- The test also caught ten tokens defined but never used, which were removed rather than shipped.
- **Dark-mode defect fixed.** `body` resolved `color: var(--ink)` against `:root`, while `.dark` redefined `--ink` on `.app`, a descendant. Every element that only inherited kept the light theme's near-black ink on a dark ground: the hero headline and the stat figures were close to invisible. Confirmed by screenshot before and after; `.app` now resolves its own colour in the scope where the token is redefined, and an E2E test measures the headline's computed luminance so it cannot regress.
- The theme also ignored the reader's system preference and always opened light. It is now seeded from `prefers-color-scheme` and still owned by the toggle afterwards, so there is one mechanism rather than two.

### 2026-09-04 authenticated shell (feature branch)

- Session state was resolved independently in five places. `user_roles` was read seven times per session, five hand-written gates could disagree, and the navigation offered every signed-in visitor every destination regardless of role.
- `src/shell.tsx` resolves user, roles, account status and profile completion once and provides them through `useSession()`. Session-scoped role reads went from four to one; the three remaining in the feature modules move as each module migrates, and the read left in `main.tsx` is the admin listing of every account's roles, which is a different query.
- Routes now declare `allow`, the roles that may open them, so the gate and the navigation derive from the same manifest. `navigableRoutes` cannot offer a destination `accessFor` would then refuse, which `shell.test.ts` proves for every role.
- One `<Guarded>` component replaces the five gates and reports *why* access was refused: `anonymous`, `incomplete_profile`, `suspended`, `forbidden`, `error`, each distinct.
- **Gap closed.** `/workspace`, `/projects` and `/research` never checked account suspension; only `/dashboard` did. A suspended employee could open all three. Row-level security still refused their rows through `is_account_active()`, so no data was exposed, but the interface opened. All four routes now refuse through the same gate.
- A session that cannot be read is reported as an error with a retry, never as `forbidden`: the roles list is empty in both cases, so the previous code showed "Access denied" for a dropped connection.
- Sign-in is now offered inline on every guarded route and returns the person to the page they asked for. `/workspace` already behaved this way; `/dashboard` showed a dead-end gate that forgot the destination. The public E2E expectation for `/dashboard` was updated to the improved behaviour.
- 16 new unit tests cover the access matrix, including that suspension is checked before roles so an Owner is suspended too, and that a guest may reach the profile to finish onboarding but not the workspace.

### 2026-09-04 typed data boundary (feature branch)

- `src/db.ts` returns a discriminated `Result` and maps PostgREST and Postgres codes to seven outcomes a user can act on, each with an Arabic and an English message. It covers `42501` RLS refusals, `PGRST301` expired sessions, `PGRST116` missing rows, constraint violations, network failures, and the `P0001` refusals our own RPCs raise, including `approval_denied` and `provider_not_cleared_for_classification`.
- It deliberately does not guess about SELECT: row-level security filters rather than raising, so a denied read and an empty table are identical over the wire. The layer keeps them distinct as outcomes so the interface can say "nothing visible to you" instead of rendering a void.
- **Security fix.** The dashboard read `account_controls` with `setAccountStatus(control.data?.status || "active")`. Any failure of that read — expired JWT, dropped connection — produced `null` and was treated as an active account, so the suspension gate failed open. A failed read is now an error state, and the workspace stays closed.
- A failed load also no longer masquerades as a permission problem: roles come back empty when their query fails, which is exactly what the "Access denied" gate tested for. The gate now shows the real cause and a retry.
- The dashboard's eleven parallel queries report one outcome through `firstError`, which puts an expired session ahead of the failures it caused.
- 19 unit tests cover the mapping. Migration is incremental: the dashboard gate and its parallel loads are converted; roughly sixty direct calls remain in the four feature modules and move as each is brought into the shell.

### 2026-09-04 archived the pre-React site

- `en/`, `blog/`, `projects/`, `styles.css`, `script.js` and `fonts.css` moved to `content/legacy/`. None of it was ever built or served — Vite builds `index.html` and `src/`, and the Worker serves `dist/` — but the three content pages hold real Arabic writing about كور COR, رتق RATQ and predictive maintenance, so they are archived rather than deleted, with a README recording what must happen before they go.
- Deleted outright as dead duplicates of the deployed `public/` copies: root `sitemap.xml`, `robots.txt`, `_headers`, `site.webmanifest`, `404.html` and `privacy.html`. The root sitemap advertised ten COR-era URLs; the deployed one lists four real routes.

### 2026-09-04 shared route manifest (feature branch)

- Routing lived in five places: the `Page` union, a path-to-page map, a page-to-path map, prefix rules inside `resolvePage`, and a second hand-written list in `src/worker.ts`. Adding a route meant editing all five, and missing the Worker shipped a page that worked locally and returned 404 in production, which had already happened once.
- `src/routes.ts` is now the single manifest. It declares each route's page, path, deep-link ownership and whether it needs a session, and stays free of React and DOM APIs so the Worker can import it. `main.tsx` and `worker.ts` both derive from it.
- `src/routes.contract.test.ts` iterates the manifest, so a new route is covered the moment it is declared. It asserts the edge serves the shell for every declared path, that deep links resolve to their parent, that an undeclared path 404s at both layers, that pages round-trip through their paths, and that no authenticated route appears in the public sitemap.
- Verified by adding a temporary `/crm` route to the manifest alone: the Worker served it with no edit, and the contract suite grew from 18 to 19 cases by itself. The route was then removed.

### 2026-09-04 Gemini provider credential verified
- `ListModels` returned HTTP 200 for the Owner-supplied key: 50 models, so the credential is a valid Gemini API key rather than a short-lived OAuth token.
- `gemini-2.5-flash` and `text-embedding-004`, the models first written into the migration, are rejected at call time. Generation returns `no longer available to new users`; the embedding model is not found for `embedContent`.
- Verified working by real calls: `gemini-3.6-flash` (HTTP 200, 92 tokens) and `gemini-3.8-flash` (HTTP 200, 111 tokens) for generation, and `gemini-embedding-001` with `outputDimensionality: 768` (HTTP 200, 768 values), which matches `memories.embedding vector(768)` exactly, so RAG needs no schema change.
- The provider row now pins `gemini-3.6-flash`. Moving to `gemini-3.8-flash` is a single row update with no code change.
- The Owner confirmed the free tier, so `max_classification` was lowered from `internal` to `public` and `requests_per_hour` from 60 to 20. Agent enablement is now derived from `provider_accepts` instead of a hard-coded ceiling.
- Still unverified: every path through the gateway itself, and the free tier's real request limits, which were not measured.
### 2026-09-04 agent gateway implementation
- Implemented the Phase 3 gateway on `claude/agent-plan-7v3s5l` with Gemini as the temporary provider while `ai-lap` is offline.
- `scripts/rls-local.sh` passed with exit 0: **109 checks**, 30 in the new `rls_agents` suite and 79 in `rls_research`. Every Reid migration, the agent gateway included, applied cleanly to a throwaway PostgreSQL 16 instance.
- The agent suite caught a real authorization defect before review: HR could approve an L3 run through the RPC but `runs_scope_read` did not let HR read it, so the approval panel would have been empty and the decision unconfirmable. The policy now also admits an approver to runs pending at their level and to runs they decided.
- Merged `origin/develop` (Research V1, commit `3039e6d`). Conflicts resolved in favour of develop's production brand-mark fix; both status histories and both pgTAP suites were kept. The migration was renumbered to `202609040002_agent_gateway.sql` because develop had already taken `202609040001`.
- `npm run check` passed after the merge: 21 unit tests across 5 files, `tsc -b`, and the Vite production build. 8 Chromium E2E tests passed.
- `npm audit --audit-level=high` reported 0 vulnerabilities.
- `supabase/tests/rls.sql` grew to 49 checks after merging develop's research suite, including `provider_accepts('gemini','internal') = false` on the free tier and the Operations agent staying disabled.
- Not verified: the migration was not applied, the Edge Function was not deployed, and no request reached Google. The Supabase CLI, Deno, and project credentials were unavailable in the working environment.
- The Gemini key supplied by the Owner was written only to the gitignored `.dev.vars`. Nothing containing it was committed.

### 2026-09-04 Research V1 merged to develop; remote application blocked

- The Owner verified the repaired brand mark on the Staging preview and it renders correctly. PR `#54` was merged into `develop` at commit `b10161e8`. CI passed all three checks on the head commit: `test`, the new `rls` job, and Cloudflare Pages.
- Local RLS coverage was extended to the remaining items on the Owner's test list: research archive and unarchive as the supervisor, archive denial for an ordinary researcher, conference/event-date publication tracking, `research.conference` updates, and a re-check of the added researcher proving that gaining membership grants read access but never management authority. The suite now runs **79 checks, all passing**.

**Blocked — the remote Supabase work could not be attempted from this environment.**

The Owner asked for the migration to be applied to the live project, for a database lint and migration-history check, and for authenticated Staging testing with Owner, researcher, supervisor and HR accounts. None of that was executed, and none of it should be recorded as done. Two independent causes, both verified rather than assumed:

1. No credentials. `supabase projects list` returns `Access token not provided`, and `supabase migration list --linked` returns `Cannot find project ref`. There is no `SUPABASE_ACCESS_TOKEN`, no `SUPABASE_DB_URL`, and no linked project in this session.
2. No network path. The environment's egress proxy refuses `api.supabase.com` and `pkogchbrknwmzefjklkr.supabase.co` with `CONNECT tunnel failed, response 403`. Even with credentials the CLI could not reach the project from here.

Credentials were deliberately not requested, because pasting them into this session would place secrets in the transcript and logs, which the Owner has forbidden. The remote steps require a session that already holds Supabase access.

**Therefore the following remain open and must not be treated as complete:**

- Migration `202609040001_research_workspace.sql` is **not applied** to the remote Supabase project. Until it is, `/research` will fail against Production and Staging because the tables, policies, helper functions and the `research-files` bucket do not exist remotely.
- No remote `supabase db lint` and no remote migration-history reconciliation.
- No authenticated Staging test with Owner, researcher, supervisor or HR identities: create/update/archive, members, datasets, experiments, ethics approvals, publications/DOI/conference, notifications, private-document upload and signed open, per-user and per-role grants, and unauthorized/suspended denial all remain unverified against the live project.
- What the 79-check suite proves is the policy logic against a local PostgreSQL 16 database with the real migrations applied. It does not prove PostgREST response shapes, the React wiring, Realtime delivery, Storage signed URLs, or browser upload against the live project.
- The `develop → main` release PR is open for review only. Research V1 must not reach Production before the remote migration is applied and the authenticated Staging suite passes, and only with explicit Owner approval.

**Untouched by instruction:** `ai-lap`, Arabic SMTP, and Microsoft OAuth. No Production data was read or modified, and no credential was written to the repository, to GitHub, or to any log.

### 2026-09-04 research workspace implementation and production brand-mark repair

Work is active on `claude/reid-system-development-bcaz9n`, branched from `develop`. Do not present Research V1 as Production-ready before the migration is applied remotely, CI passes, and an authenticated Staging session verifies the workflows.

**Production defect fixed — the header brand mark was broken on `reidpro.com`.**

- The Owner reported a broken-image placeholder next to `ريّد` in the live header. Root cause: `src/main.tsx` referenced the mark as the literal string `/assets/img/reid-logo.svg`. Vite rewrites imported assets and copies `public/`, but leaves literal URLs untouched, and `assets/` sits outside `public/`. Nothing was emitted to `dist/`, so the tag returned 404 in Production while still resolving against the dev server — which is exactly why the existing E2E assertion passed and the bug shipped.
- The mark is now imported, so Vite emits and content-hashes it. A production build confirms `dist/assets/reid-logo-CbVH3nq6.svg` exists and that both the bundle and the `index.html` favicon link point at it.
- Two regressions were added. `src/assets.test.ts` fails the build if any file under `src/` references `/assets` through a bare string literal. The E2E assertion no longer matches a fixed URL but asserts the rendered image has a non-zero `naturalWidth`, which is the condition that actually broke.
- The `/assets/fonts/*.woff2` URLs inside `src/style.css` were checked and are safe: Vite rewrites `url()` in processed CSS, and both font files appear in `dist/`.

**Research workspace V1.**

- Migration `202609040001_research_workspace.sql` extends `research` with field, dates, funding, archive, `created_by` and `updated_at`, and adds `research_datasets`, `research_experiments`, `research_ethics_approvals`, `research_publications`, `research_documents`, `research_document_permissions`, and `research_activity`, plus audit triggers, an activity trigger, membership/ethics notifications, Realtime publication entries, and the private `research-files` bucket.
- `research_members` had RLS enabled since the core migration but carried no policy at all, so the table was unreadable and unwritable by every client. It now has scoped read and supervisor-only write policies.
- Bilingual `/research` and `/research/:id` routes were added with overview, tasks, datasets, experiments, ethics, publications, documents, and activity tabs, role-aware controls, 60-second signed document URLs, and per-user/per-role grant management. `/research` and `/research/` deep links were added to the Worker SPA allow-list, and unknown routes keep their edge 404.
- Two data-integrity rules are enforced in the database rather than the UI: a DOI must match `10.x/suffix`, and an ethics record moved to `approved` or `rejected` must carry `decided_by` and `decided_at`.

**Permissions and RLS were tested against the database, not the interface.**

- `scripts/rls-local.sh` applies every migration in `supabase/migrations` to a throwaway PostgreSQL 16 database and runs `supabase/tests/local/rls_research.sql` as real `anon` and `authenticated` roles with JWT claims. It needs no Docker, Supabase credentials, or network access. `supabase/tests/local/bootstrap.sql` supplies only the missing platform pieces (auth schema, `auth.uid()`, the anon/authenticated/service_role roles, storage schema, Realtime publication); every policy under test is the verbatim policy from the migrations. pgvector is unavailable locally, so the embedding column falls back to a shim domain — no policy reads it.
- Result: **70/70 checks pass, 0 fail**, across six actors — anonymous, an unrelated active employee, a suspended member, an ordinary researcher, the supervisor, HR, and the Owner.
- Denials proven, not assumed: anonymous sees no research at all; an unrelated employee sees only the public study and none of its datasets, documents, activity or unpublished papers; a **suspended** member loses every membership-derived permission even though the membership row still exists; an ordinary researcher cannot rename the study, add teammates, register datasets, file ethics approvals, record publications, upload files, grant themselves access to a restricted document, or create research tasks; a researcher cannot log an experiment under another author's name; a supervisor cannot create a new research record, attribute a dataset to someone else, forge the granter of a file permission, or upload into a research folder they do not manage; the Owner cannot attribute a new research record to someone else or create one without a supervisor.
- Grants proven to work: a direct user grant and an additive-role grant each open a restricted document through `can_read_research_document`, and storage object visibility follows the document decision rather than bucket membership.
- Side effects proven: membership inserts notify the researcher, an ethics decision notifies the supervisor, the activity feed attributes the supervisor's dataset, ethics changes reach `audit_logs`, the `research-files` bucket is private, and all eight research tables publish to Realtime.
- One check initially failed and found a fault in the **test**, not the policy: the seed made the same person supervisor of both studies, so cross-research upload denial could never trigger. The second study was reassigned to a different supervisor and the denial then held.
- The suite runs as its own `rls` CI job against a `postgres:16` service container, so this coverage is enforced on every PR rather than run by hand.

**Local verification.**

- `npm run check`: pass; 13 Vitest checks (TypeScript, Vite Production build included).
- `npm run test:e2e`: pass; 8 Chromium public workflows, including anonymous denial for `/research` and `/research/:id`, and the new brand-mark render assertion.
- `npm run test:rls`: pass; 70/70 RLS allow/deny checks.
- `playwright.config.ts` now honours an optional `PLAYWRIGHT_CHROMIUM_PATH` so sandboxes with a preinstalled Chromium can run the suite; CI still installs its own pinned browser.
- `@types/node` was added as a devDependency because the new asset regression test reads the filesystem.

**Not done — remaining before Research V1 may be called complete.**

- Migration `202609040001` has **not** been applied to remote Supabase. No Supabase credentials exist in this environment, so no remote migration, schema lint, or Edge Function deployment was attempted.
- No Staging deployment and no authenticated Owner/supervisor/researcher browser verification. The RLS harness proves the policies against a local database; it does not prove PostgREST shapes, the UI wiring, or Realtime delivery against the live project.
- Research document upload/download through a real browser is unverified, the same gap already recorded for employee and project files.
- Equivalent local RLS suites for Employee, Projects, Applications, and account lifecycle are still missing; only Research is covered.
- Untouched by instruction: `ai-lap` and any AI agent work, Arabic SMTP, and Microsoft OAuth. No Production data was read or modified, and no secret was added to the repository or to GitHub.

### 2026-09-04 Reid brand mark

- Replaced the temporary header `R` tile and legacy COR-era triangular favicon with the Owner-provided Reid rising-bars brand mark.
- Added a compact transparent SVG reproduction of the supplied artwork so the mark remains sharp at favicon, mobile-header, desktop, light-mode, and dark-mode sizes. The bilingual wordmark remains `ريّد` in Arabic and `Reid` in English.
- The supplied PNG remains external source artwork and was not committed with its large transparent canvas; `assets/img/reid-logo.svg` is the web-ready canonical mark.

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
- PR `#45` passed CI and Cloudflare Pages, was merged into `develop`, and migration `202609030006` was applied remotely with a clean database lint. The repeated remote Employee/Manager/HR suite passed 25/25 checks, including password sign-in, employee timesheets, direct-report manager scope, tasks, KPIs, performance reviews, HR private upload, employee/HR signed-file open, and manager denial for HR documents.
- The live application suite passed 15/15 checks: public submission, synthetic PDF upload, HR signed CV open, internal rejection reason, first-decision-wins denial, anonymous privacy, approval, invitation dispatch, and persisted delivery state. The invitation to the controlled company alias was `sent`, and the Owner supplied phone evidence that the invitation arrived and opened the approved profile flow successfully.
- Google OAuth was rotated without downtime: a new secret was stored only in Supabase, a Staging Owner callback completed, and the old secret was disabled after the successful test. GitHub OAuth app `Reid Company Platform` was created with the exact Supabase callback, enabled in Supabase, and its Staging Owner callback also completed successfully.
- Microsoft OAuth remains blocked because Microsoft Entra requires a signed-in company Microsoft account and no Microsoft session is available. Do not invent or create a company tenant without the Owner completing that login.
- Custom SMTP and Arabic sender/template activation were explicitly deferred by the Owner. Supabase Free locks template editing while its default sender is used. Ready-to-activate Arabic invite, Magic Link, and secure review-link templates are stored in `docs/EMAIL_TEMPLATES.md`; evaluate Resend or Brevo later and keep credentials only in Supabase.
- Production release PR `#47` passed CI and Cloudflare but exposed divergent squash ancestry between `main` and `develop`. Branch `chore/sync-production-history` merges the current Production ancestry into `develop` while retaining the fully tested `develop` state, so the Owner release can be merged cleanly without overwriting either branch history.
- The history synchronization was merged through PR `#48`, after which owner-approved release PR `#47` merged to `main` at commit `59bd4d2`. The `main` and `develop` source trees are identical at this release point.
- The connected Cloudflare Worker build for `59bd4d2` failed because its Build command was empty: Cloudflare installed dependencies and immediately ran `npx wrangler deploy`, so the configured `./dist` asset directory did not exist. The Worker Build configuration now runs `npm run build` before deploy; no application secret or source file was changed for this repair.
- The corrected retry created Worker version `cc79d37b` and promoted it to Production. Live checks passed for `/`, `/workspace`, `/dashboard`, and `/profile` with HTTP 200, the required security headers, and a new production bundle containing the secure email-review deep-link flow and internal rejection-reason UI. Future pushes to `main` now have a complete install → build → deploy pipeline.

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
