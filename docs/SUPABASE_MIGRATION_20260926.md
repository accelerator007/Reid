# Reid project migration — 2026-09-26

The Owner selected destination `cfxntjnewkmlvkogfxyu` and then explicitly replaced
the initial fresh-start request with migration of all existing data and accounts.
Do not create a new Owner or discard existing identities based on the superseded
fresh-start instruction.

## Source and destination

| Item | Source, still live | Destination, not serving production |
| --- | --- | --- |
| Project | `pkogchbrknwmzefjklkr` | `cfxntjnewkmlvkogfxyu` |
| Region | Mumbai | Seoul |
| Site/API runtime | Existing phase-1 containers | Candidate not activated |
| Administrative API | Current CLI account gets HTTP 403 | Authorized |
| Schema | Existing production | All 53 repository migrations applied |
| Accounts | 116 visible through Auth admin API | 0; not recreated with new passwords |
| Files | 11 files in six private buckets | All 11 copied and SHA-256 verified |

The repository CLI link and `supabase/config.toml` now identify the destination.
Production `service.env`, `build.env`, QR session volume and ai-lap configuration
remain on the source. Do not infer that CLI linking migrated production.

## Completed and verified

- `supabase db push --dry-run`, then `supabase db push --yes`, applied all 53
  migrations to the initially empty destination.
- Destination has 78 public base tables; all 78 have RLS enabled.
- All nine Edge Function sources were deployed. The six public/internal-token
  functions retain their own authentication checks; `manage-account`,
  `decide-application`, and `whatsapp-inbox` also retain gateway JWT verification.
  Deployment alone does not make integrations operational: secrets, identities,
  providers and the runner still need migration/configuration.
- Reviewed `supabase config diff`, then pushed only four declared differences:
  production site URL, redirect allow-list, and disabling public/email signups.
  Existing undeclared destination settings were retained.
- `scripts/export-project-api.py` produced an AES-256-GCM recovery export of 77
  exposed public tables/views (22,112 rows), 116 Auth API user records, bucket
  metadata, public Auth settings, and all 11 file contents. Every encrypted write
  was read back and decrypted for equality.
- `scripts/copy-project-storage.py` verified all export hashes, retained bucket
  access settings, copied missing files, and downloaded every destination object
  to verify SHA-256 equality. It refuses to overwrite different existing bytes.

Private recovery material is outside Git under
`/home/reid/.local/state/reid-migration-20260926/`. Directories are private and
credentials, encryption key and recovery files are mode 0600. Do not commit,
print, or attach these exports or keys. The summary files contain counts only.

## Remaining blockers and limitations

The recovery export is **not a transactional database backup**. Source traffic
continued during its creation. Public records are backed up but have not yet
been imported into the destination. Original Storage owner IDs/timestamps and
complete account authentication data are not restored.

The Auth admin API does not provide a full `auth` schema dump with password
hashes, sessions, and MFA secrets. Source Google and GitHub login are enabled;
destination Google and GitHub login are not configured. Access to the old
project's administrative/database configuration or an authorized full source
backup is required to preserve these details. Do not replace accounts with
passwordless or randomly reset users and describe that as a complete migration.

Source management queries and function listing both returned HTTP 403 for the
currently authenticated account. Having the destination open does not grant
access to the source. A clarification is pending about access to the old project.

## Completion sequence after source access is available

1. Obtain an authorized full source database/Auth export and source schema,
   role, publication, extension, OAuth, SMTP, integration and scheduled-job
   configuration. Verify schema drift against repository migrations. Keep the
   destination CLI link explicit so source access cannot redirect deployment.
2. Plan a bounded write pause for the final consistent export. Drain/inspect
   WhatsApp jobs, outbound sends and reminders. Preserve uncertain-send states;
   never replay messages or old due reminders as a consequence of import.
3. Restore original Auth identities and public rows with their original UUIDs,
   relationships, timestamps and ownership in a tested transaction. Account for
   target seed records; suppress restore-time side-effect triggers only inside
   the restore transaction and restore normal enforcement afterward. Preserve
   historical finance records while retaining the approved no-money product
   behavior and disabled finance tools.
4. Reconcile Storage owner metadata and any files created since the recovery
   export. Rewrite project-specific public URLs where needed. Recheck every
   object hash, table count and relevant foreign-key relationship.
5. Configure secrets server-side, OAuth callback URLs, email delivery, QR
   transport, and the ai-lap runner's project URL/token. Preserve `SESSION_KEY`
   and the existing encrypted QR session together. Test the new project using
   isolated candidate services before changing live environment files.
6. Verify Owner and non-Owner access, existing account sign-in, scoped memories,
   private files, photo/voice processing, approvals, clock answers and queue
   behavior. Activate the candidate only after these checks. Keep source and
   rollback images available until final acceptance and document the cutover.

Supabase references:

- [Migrating Auth users](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects)
- [Backup and restore with the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
