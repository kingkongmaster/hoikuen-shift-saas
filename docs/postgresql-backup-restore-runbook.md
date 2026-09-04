# AeN Shift PostgreSQL backup / restore runbook

This is the disaster-recovery path for the complete PostgreSQL database. The tenant JSON export API is a tenant portability tool, not a replacement for this backup. Migration/import pre-flight backups call the same `ops/postgres-backup/backup.sh`; they must not invent another dump format.

## Daily backup

Use PostgreSQL 16 client tools and a least-privilege backup role. Keep credentials in a mode-600 `PGPASSFILE`, never in Git, command arguments, filenames, or logs. Install `deploy/postgres-backup/backup.env.example` as `/etc/aen-shift/backup.env`, set that file and its `PGPASSFILE` to mode 600, then install the reviewed cron example manually. The default and minimum retention is seven daily generations. Production operators should also copy encrypted backups to an access-controlled off-host store; that is intentionally not automated in the pilot assets.

The backup script creates a custom-format archive, verifies non-zero size, mode 600, `pg_restore --list`, and SHA-256 before marking success. Runtime state is kept under the private backup directory in `status/latest.env` and `status/operations.log`. Monitoring may alert on a non-zero exit or a stale/missing `lastSuccessAt`; the log contains no dump contents or connection URL.

Before a migration, formal roster import, tenant-master update, or other material data operation, invoke the same script with an explicit environment label. Stop the data operation if the backup command fails.

## Recovery rehearsal or incident recovery

Never restore directly over production and never use the current FINAL database as the target.

1. Confirm the incident and freeze writes if required.
2. Prepare a new PostgreSQL database on an isolated host/cluster.
3. Select a dated archive for the correct environment.
4. Verify its mode, SHA-256 sidecar, and `pg_restore --list` readability.
5. Set `TEST_DATABASE_ISOLATED=true`, localhost `PGHOST`, and a new database name containing `restore_test` or `restore_verify`; run `restore-verify.sh`.
6. Confirm `_prisma_migrations` has no incomplete migration.
7. Compare the report's principal table counts and, where applicable, the canonical assignment digest.
8. Start the application against the restored database in an isolated environment and test login.
9. Test tenant boundaries using accounts from at least two tenants.
10. Only after review, decide whether and how to switch the application connection. The verification script never performs that switch.

Example rehearsal (credentials remain in the environment or PGPASSFILE):

```sh
TEST_DATABASE_ISOLATED=true \
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=aenshift_restore \
PGADMIN_DATABASE=postgres RESTORE_DATABASE=aenshift_restore_verify_20260902 \
BACKUP_FILE=/secure/backups/aen-shift_production_20260902T021700Z.dump \
EXPECTED_STAFF_COUNT=23 EXPECTED_ASSIGNMENT_COUNT=690 \
EXPECTED_CANONICAL_DIGEST=411bfd595553afa4dda3ee4fb6ceaa5eb70e304c2143cee8ed24f60f7cd01c46 \
ops/postgres-backup/restore-verify.sh
```

An existing target, non-local host, missing isolation flag, protected-looking database name, bad checksum, unreadable archive, unsafe permissions, or wrong canonical result is a hard failure. The script does not drop existing databases by default.

## Pilot and commercial follow-up

For the Musubi pilot, daily custom archives, seven generations, private permissions, visible success/failure state, and a documented periodic isolated restore are mandatory. The commercial service additionally needs encrypted off-host copies, key rotation, per-tenant/legal retention policy, centralized alert delivery, metrics/SLOs, automated restore rehearsals, access/audit review, regional disaster recovery, and documented RPO/RTO.
