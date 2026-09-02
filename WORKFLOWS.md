# Workflows
Anonymous application → private CV → Arabic admin notification → atomic first Admin/HR decision → internal-only rejection reason or Magic Link on approval. Direct public account creation is disabled in the UI: only an approved applicant receives an account invitation. Email links are single-use and expire.

Reviewer links use `/dashboard?review=<application-id>` and never decide directly. The reviewer must authenticate and pass database RBAC before the application can load or a decision can execute. This link is ready for the Arabic email template once outbound SMTP is configured.

Owner/Super Admin account management → protected Edge Function → active-caller and target checks → Auth ban/unban plus audited account status. Suspended accounts lose role-based RLS access immediately; current Owner and self-modification are protected.

Agent goal → policy check → task/run → allow-listed tool → approval when required → audit → KPI/report. Weekly executive report is emailed; daily remains in the dashboard.
