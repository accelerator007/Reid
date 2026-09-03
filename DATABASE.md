# Database
The source of truth is `supabase/migrations`. Every exposed table has RLS. Users may hold multiple roles. Project/research membership is scoped separately. `audit_logs` is trigger-written. CVs use a private bucket and short-lived signed URLs.

Free Supabase has no automatic downloadable backups. The weekly workflow creates a private artifact when `SUPABASE_DB_URL` is configured.

Employee V1 is defined by migration `202609030001_employee_workspace.sql`: `departments`, employment fields on `profiles`, `onboarding_items`, `calendar_events`, `announcements`, `employee_documents`, `employee_kpis`, `performance_reviews`, plus the existing `tasks`, `timesheets`, and `notifications`. Operational changes are audited and relevant feeds are enabled for Realtime. Working hours are the sum of approved user-entered timesheet minutes; there is no attendance clock-in/out.

The `employee-documents` bucket is private, limited to PDF, PNG, JPEG, and text files up to 10 MB. Object paths begin with the employee UUID. The employee, HR, and Admin roles can access the relevant path; signed download URLs expire after 60 seconds in the UI.
