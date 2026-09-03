# Workflows
Anonymous application → private CV → Arabic admin notification → atomic first Admin/HR decision → internal-only rejection reason or Magic Link on approval. Direct public account creation is disabled in the UI: only an approved applicant receives an account invitation. Email links are single-use and expire.

Reviewer links use `/dashboard?review=<application-id>` and never decide directly. The reviewer must authenticate and pass database RBAC before the application can load or a decision can execute. This link is ready for the Arabic email template once outbound SMTP is configured.

Owner/Super Admin account management → protected Edge Function → active-caller and target checks → Auth ban/unban plus audited account status. Suspended accounts lose role-based RLS access immediately; current Owner and self-modification are protected.

Approved account → role-aware `/workspace` → employee directory/profile → onboarding and assigned tasks → calendar/announcements/documents → KPIs/reviews → timesheet minutes aggregated into working hours. HR/Admin manage company and employee records; employees operate only within their own assignment/ownership scope. Realtime refreshes operational feeds, while database RLS and private Storage policies remain authoritative.

New task/onboarding/KPI/company announcement → database trigger → employee-owned notification → Realtime Workspace feed → employee marks read. Notification policies prevent one employee from reading or updating another employee's feed.

Admin creates one of five project types → assigns manager and initial manager membership → manager adds members/client/budget/GitHub → Kanban tasks, milestones, meetings, KPIs and private files → project activity feed plus security audit. Archive hides the project from the active directory without deleting its history. Project membership gates all reads; file metadata and Storage independently enforce restricted-file grants.

Agent goal → policy check → task/run → allow-listed tool → approval when required → audit → KPI/report. Weekly executive report is emailed; daily remains in the dashboard.
