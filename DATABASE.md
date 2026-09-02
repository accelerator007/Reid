# Database
The source of truth is `supabase/migrations`. Every exposed table has RLS. Users may hold multiple roles. Project/research membership is scoped separately. `audit_logs` is trigger-written. CVs use a private bucket and short-lived signed URLs.

Free Supabase has no automatic downloadable backups. The weekly workflow creates a private artifact when `SUPABASE_DB_URL` is configured.
