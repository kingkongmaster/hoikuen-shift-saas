#!/bin/sh

set -eu
umask 077
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

ops_assert_local_restore_target
ops_require_command python3
ops_prepare_backup_directory "${BACKUP_DIRECTORY:-}"
restore_run_id=$(python3 "$SCRIPT_DIRECTORY/status.py" start restore)
restore_checksum=''
record_restore_exit() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ] && [ "${created:-false}" = true ] && [ "${RESTORE_CLEANUP_ON_FAILURE:-false}" = true ]; then
    dropdb --maintenance-db "${PGADMIN_DATABASE:-postgres}" "$RESTORE_DATABASE" >/dev/null 2>&1 || true
  fi
  python3 "$SCRIPT_DIRECTORY/status.py" finish restore "$restore_run_id" "$code" "${BACKUP_FILE:-}" "$restore_checksum" || exit 2
  exit "$code"
}
trap record_restore_exit EXIT
trap 'exit 130' HUP INT TERM
backup_file=${BACKUP_FILE:-}
[ -n "$backup_file" ] || ops_die 'BACKUP_FILE is required' 64
case "$backup_file" in /*) ;; *) ops_die 'BACKUP_FILE must be absolute' 64 ;; esac
ops_assert_private_file "$backup_file"
ops_assert_private_file "$backup_file.sha256"
ops_require_command pg_restore
ops_require_command psql
ops_require_command createdb
ops_sha256_verify "$backup_file" "$backup_file.sha256"
restore_checksum=$(awk 'NR == 1 {print $1}' "$backup_file.sha256")
pg_restore --list "$backup_file" >/dev/null 2>&1 || ops_die 'pg_restore cannot read the archive' 65

admin_database=${PGADMIN_DATABASE:-postgres}
case "$admin_database" in template0|template1) ops_die 'unsafe PGADMIN_DATABASE' 77 ;; esac
exists=$(PGDATABASE="$admin_database" psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT 1 FROM pg_database WHERE datname = '$RESTORE_DATABASE'" | tr -d '[:space:]')
[ -z "$exists" ] || ops_die 'restore target already exists; refusing overwrite or drop' 77
ops_require_command node

createdb --maintenance-db "$admin_database" "$RESTORE_DATABASE"
created=true
PGDATABASE="$RESTORE_DATABASE" pg_restore --exit-on-error --no-owner --no-privileges --dbname "$RESTORE_DATABASE" "$backup_file"
audit_script=${RESTORE_AUDIT_SCRIPT:-$SCRIPT_DIRECTORY/../../apps/api/scripts/postgres-restore-audit.cjs}
[ -f "$audit_script" ] || ops_die 'restore audit script is missing' 69
report_path=${RESTORE_REPORT_PATH:-${TMPDIR:-/tmp}/aen-shift-restore-report.json}
case "$report_path" in /*) ;; *) ops_die 'RESTORE_REPORT_PATH must be absolute' 64 ;; esac

database_url="postgresql://${PGUSER}@${PGHOST}:${PGPORT:-5432}/${RESTORE_DATABASE}"
if [ -n "${PGPASSWORD:-}" ]; then
  encoded_password=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$PGPASSWORD")
  database_url="postgresql://${PGUSER}:${encoded_password}@${PGHOST}:${PGPORT:-5432}/${RESTORE_DATABASE}"
fi
TEST_DATABASE_ISOLATED=true DATABASE_URL="$database_url" RESTORE_REPORT_PATH="$report_path" VERIFY_MONTH="${VERIFY_MONTH:-2026-09}" EXPECTED_STAFF_COUNT="${EXPECTED_STAFF_COUNT:-}" EXPECTED_ASSIGNMENT_COUNT="${EXPECTED_ASSIGNMENT_COUNT:-}" EXPECTED_CANONICAL_DIGEST="${EXPECTED_CANONICAL_DIGEST:-}" node "$audit_script"
chmod 600 "$report_path"
ops_assert_private_file "$report_path"
ops_log "restore verification success: database=$RESTORE_DATABASE report=$(basename "$report_path")"

if [ "${RESTORE_CLEANUP_AFTER_SUCCESS:-false}" = true ]; then
  ops_require_command dropdb
  dropdb --maintenance-db "$admin_database" "$RESTORE_DATABASE"
  ops_log "isolated restore database removed after successful verification"
fi
