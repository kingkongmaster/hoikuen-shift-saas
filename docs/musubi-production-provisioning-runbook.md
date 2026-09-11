# むすび保育園 Production Provisioning Runbook

## Safety boundary

Deploy source is an immutable image built from a clean RC commit. Production operations never run from a dirty checkout. Only Caddy publishes host ports 80/443. API, Web and PostgreSQL remain on internal Docker networks; PostgreSQL 5432 is never published.

Production provisioning failures are `SYSTEM_SAFETY_BLOCK`. An administrator cannot override a Tenant, database, environment, migration, receipt or confirmation mismatch.

## Required root-owned files

- `/opt/aen-shift/.env`, mode 600
- PostgreSQL password file, mode 600
- backup `.pgpass`, mode 600
- Approved Git-external roster staging directory `/opt/aen-shift/roster`: root:20001, mode 750; `roster.json`: root:20001, mode 640. No world access. The original Mac roster is not changed.

Never print these values, put them in Git, bake them into an image, or retain the roster on the VPS after provisioning.

## Immutable images

Build and record digests for the API runtime, Web runtime, migration, operations and backup images. Configure digest-qualified references in the deployment environment. The operations image contains only the four provisioning scripts, common guard, tenant packages, production dependencies and generated Prisma client. It contains no fixture, test, roster, PDF, dump or secret.

## Formal order

1. Start PostgreSQL and wait for `pg_isready`.
2. Run migration `status`, then reviewed `deploy`, then `status` again.
3. Choose and record an explicit Tenant UUID.
4. Run admin bootstrap dry-run. It creates a receipt under the private provisioning-state volume.
5. Run admin bootstrap apply with `CONFIRM_PRODUCTION_APPLY=APPLY_MUSUBI_PRODUCTION_<tenant UUID>` and verify. `deferred-link` is mandatory for Musubi.
6. Use `MUSUBI_ROSTER_DIRECTORY=/opt/aen-shift/roster` and the `ops/provisioning/run-operations.sh` host preflight wrapper. Compose binds this directory read-only at `/run/aen-shift-roster`; importer accepts only `/run/aen-shift-roster/roster.json`. Run roster dry-run, apply and verify against that path with the same target-specific confirmation discipline.
7. Run Permanent Master dry-run, apply and verify.
8. Enter the new month's conditions through UI/API. Use Monthly loader only for an approved non-PII package, with dry-run, apply and verify.
9. Run tenant-wide verify.
10. Take an initial custom-format backup and verify its SHA-256/readability.
11. Restore into a separate isolated `restore_verify` database and run the restore audit.
12. Start Web/API, complete administrator first login and mandatory password change, then begin acceptance.

Every production operation requires `DEPLOYMENT_ENV=production`, `ALLOW_PRODUCTION_PROVISIONING=true`, matching database target IDs, the database name from `DATABASE_URL`, explicit Tenant UUID, 30 completed migrations and the tenant-specific apply token. Apply additionally requires a matching dry-run receipt less than 24 hours old. Do not reuse receipts across databases, tenants, packages or months.

## Idempotency

- Bootstrap intentionally refuses a second active administrator; this is a safe stop, not a duplicate operation.
- Roster importer upserts staff but must be rerun as dry-run before each apply. Verify must remain 23 displayed, 20 rotation eligible, 3 food-service/fixed-excluded and one linked administrator.
- Permanent and Monthly loaders use scoped upserts/find-before-create and must produce unchanged counts on the second apply.
- A mismatched Tenant, database, package digest or expired receipt stops before mutation.

## PostgreSQL volume loss

Do not recreate an empty volume and point production traffic at it. Stop API writes, create a new PostgreSQL 16 volume/container, verify the chosen archive and checksum, restore to the new database, confirm all 30 migrations and tenant-wide counts, run login and Tenant-isolation checks, then explicitly switch `DATABASE_URL`. Preserve the failed volume for investigation. Never restore over the existing production database.

## Backup and off-host boundary

The daily backup container runs on the private database network, writes custom archives and SHA-256 sidecars to the backup volume with private permissions, and retains at least seven generations. `CRON_TZ=Asia/Tokyo` makes the schedule independent of the VPS timezone.

When enabled, `offhost-copy.sh` encrypts a local archive with `age` before calling an absolute executable upload adapter. Adapter failure returns non-zero and records a failure while preserving the local archive. It never stops PostgreSQL. Credentials and the recipient are external configuration.

Before trial, choose a notification adapter. `check-status.sh` reports backup failure, off-host copy failure and a success older than 26 hours. An unset adapter always emits a visible warning.

## Monitoring

At minimum monitor HTTPS Web, `/api/health`, `/api/ready`, PostgreSQL health, container status/restart/OOM, available memory, disk/volume capacity, backup freshness and certificate expiry. Monitoring output must contain service codes and counts only, never roster data or credentials.

## High fixes: roster boundary (2026-09-08)

Operations runs exclusively as UID/GID 20001:20001, with all capabilities dropped and no-new-privileges. Prepare only an explicitly approved staging copy; never chmod, delete, copy into Git, or modify the Mac source automatically. On Linux, an administrator creates a dedicated GID 20001 with no unrelated members, installs the staging directory as root:20001 750 and the file as root:20001 640. Use a fresh provisioning-state volume for this UID; do not relax permissions of existing state volumes. Fixed host path preflight rejects symlinks, unexpected ownership/modes or missing files without reading contents. Container preflight verifies exact path, no symlinks, file owner/group/mode/link count/size and Linux mountinfo read-only status, then uses O_NOFOLLOW. It runs on dry-run/verify/apply and rereads the checksum before apply. World-readable and writable mounts are hard failures. No permission override exists. Use the wrapper for every production importer run; mount source directory must not be replaced during a run.

Docker Desktop translates ownership on macOS bind mounts. Do not weaken the guard for this; rehearsal uses a disposable native Linux directory bind-mounted from the Docker engine filesystem. Root is used only to provision anonymous test file permissions; the importer always runs as UID 20001.

## High fixes: authoritative backup state (2026-09-08)

Python 3 is included in the backup image. `status.py` owns JSON records in the private backup status directory: latest-backup.json, last-success.json, last-failure.json and latest-restore.json. Every operation has a random UUID, STARTED/SUCCESS/FAILURE, startedAt/finishedAt, exitCode, generation filename, SHA-256 and restore verification status. A locked start prevents concurrent or unfinished operations being silently replaced. Completion files are replaced atomically; latest stays STARTED until completion records are durable. Latest run identity, never filesystem timestamps, establishes ordering. Same-run success/failure contradictions, corrupted/missing records and incomplete runs fail closed. Legacy .env status records are not treated as proof of health: perform a fresh backup to initialize version 1 JSON records.

`check-status.sh` verifies the current state, the latest successful archive SHA-256, the 26-hour freshness window, and the latest restore result. A failed restore remains an alert until a later verified restore succeeds. A later successful backup does not erase a restore failure. Without a notification adapter, it emits a WARNING and still returns nonzero for an unhealthy state. Alert scheduling and an operator-chosen external notification destination remain deployment prerequisites.

Example local status check: `docker compose --profile operations run --rm --entrypoint sh backup /opt/aen-shift/backup/check-status.sh`. The same backup volume must be used by backup, monitor and restore. Restore invocation must now provide BACKUP_DIRECTORY; no new remote restore permission is introduced. For an abandoned STARTED record, preserve the evidence, verify the prior process is no longer running, then record failure using its exact run UUID via `status.py finish backup <runId> 1`; never erase state to manufacture health.

Generations contain a UTC microsecond timestamp and UUID. Retention keeps at least seven generations, including associated encrypted files. Off-host failure marks the entire run failed while retaining the local archive. Do not source JSON or legacy status records as shell code. Keep all state and archives private.

## Release Gate: role-separated connections

API receives only the application-role `DATABASE_URL`. Migration receives only
`MIGRATION_DATABASE_URL`, mapped to its process-local `DATABASE_URL`. Operations
receives only `OPERATIONS_DATABASE_URL` (aen_app). Web and Caddy receive neither DB
nor JWT credentials. Build Web with `VITE_RELEASE_CHANNEL=musubi-beta`.

After all migrations, and before starting API/operations, run
`deploy/musubi-beta/application-grants.sql` through PostgreSQL 16 psql as
`aen_migrator`, using a human-managed service entry and PGPASSFILE. Verify the
host, database, role and backup before executing; do not put URLs/passwords on
the command line or print resolved Compose environments. Example invocation
(with the service entry already safely configured):

```sh
PGSERVICE=aen_migration psql -X -v ON_ERROR_STOP=1 -f deploy/musubi-beta/application-grants.sql
```

The transaction revokes application schema/database CREATE and TEMP privileges,
grants business-table CRUD, and denies `_prisma_migrations`. The read-only
`aen_release_migration_status` view exposes only migration name, checksum,
completion and rollback timestamps. Operations uses it to retain exact-release
verification without granting access to migration logs or migration-table DML.
A missing or mismatched attestation stops operations. Reapply grants after future
migrations before enabling runtime traffic. This is provisioning SQL, not a
rewrite or addition to Prisma migrations.

Backup retains a dedicated read-only role and its own PGPASSFILE; it is never
mounted in API, Web, migration or operations. The maintenance role performs
restore into a new isolated database only. Neither backup nor restore credentials
are sourced from the three application/migration/operations URL variables.

`backup-grants.sql` sets SELECT-only privileges for a pre-provisioned `aen_backup`
role. Run it as `aen_migrator` with the same confirmed target after application
grants; the file creates no login or secret. Set `BACKUP_PGUSER=aen_backup` and
mount only its protected PGPASSFILE in the backup container. Maintenance must
create/manage that dedicated login separately before first operational backup.
Use the maintenance role, never aen_app/aen_backup, for restore and ownership
verification. PostgreSQL backup contains PII and must remain access restricted.
