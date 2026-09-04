# Database
The source of truth is `supabase/migrations`. Every exposed table has RLS. Users may hold multiple roles. Project/research membership is scoped separately. `audit_logs` is trigger-written. CVs use a private bucket and short-lived signed URLs.

Free Supabase has no automatic downloadable backups. The weekly workflow creates a private artifact when `SUPABASE_DB_URL` is configured.

Employee V1 is defined by migration `202609030001_employee_workspace.sql`: `departments`, employment fields on `profiles`, `onboarding_items`, `calendar_events`, `announcements`, `employee_documents`, `employee_kpis`, `performance_reviews`, plus the existing `tasks`, `timesheets`, and `notifications`. Operational changes are audited and relevant feeds are enabled for Realtime. Working hours are the sum of approved user-entered timesheet minutes; there is no attendance clock-in/out.

The `employee-documents` bucket is private, limited to PDF, PNG, JPEG, and text files up to 10 MB. Object paths begin with the employee UUID. The employee, HR, and Admin roles can access the relevant path; signed download URLs expire after 60 seconds in the UI.

Projects V1 extends `projects` and uses `project_members`, existing scoped `tasks`, `project_milestones`, `project_meetings`, `project_kpis`, `project_files`, `project_file_permissions`, and `project_activity`. Security-definer membership helpers are executable only by authenticated users and avoid recursive membership RLS. `project-files` is private; paths begin with the project UUID and signed reads must pass metadata plus file-level authorization.

Research V1 is defined by migration `202609040001_research_workspace.sql`: lifecycle, funding, and archive fields on `research`, plus `research_members`, `research_datasets`, `research_experiments`, `research_ethics_approvals`, `research_publications`, `research_documents`, `research_document_permissions`, and `research_activity`. `is_research_member`, `can_manage_research`, and `can_read_research_document` are security-definer helpers executable only by authenticated users, which keeps membership checks non-recursive. DOI values are constrained to the `10.x/suffix` form and an approved or rejected ethics row must carry `decided_by` and `decided_at`. `research-files` is private; paths begin with the research UUID and signed reads must pass metadata plus document-level authorization.

`scripts/rls-local.sh` applies every migration to a throwaway PostgreSQL 16 database and runs the suites in `supabase/tests/local/` as real `anon` and `authenticated` roles, so allow/deny behaviour is proven against the policies rather than the UI. It needs no Docker, Supabase credentials, or network access, and runs as its own CI job.
