#!/bin/sh

set -eu
umask 077
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

environment=${BACKUP_ENVIRONMENT:-}
ops_safe_slug "$environment" 'BACKUP_ENVIRONMENT'
[ -n "${PGHOST:-}" ] || ops_die 'PGHOST is required' 64
[ -n "${PGDATABASE:-}" ] || ops_die 'PGDATABASE is required' 64
ops_prepare_backup_directory "${BACKUP_DIRECTORY:-}"
ops_require_command pg_dump
ops_require_command pg_restore

ops_require_command python3
run_id=$(python3 "$SCRIPT_DIRECTORY/status.py" start backup)
partial=''
destination=''
checksum=''
record_failure() {
  exit_code=${1:-1}
  [ "$exit_code" -ne 0 ] || exit_code=1
  trap - EXIT HUP INT TERM
  [ -z "$partial" ] || rm -f -- "$partial"
  python3 "$SCRIPT_DIRECTORY/status.py" finish backup "$run_id" "$exit_code" "$destination" "$checksum" || true
  exit "$exit_code"
}
trap 'record_failure $?' EXIT
trap 'record_failure 130' HUP INT TERM

timestamp=$(python3 -c 'import datetime; print(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))')
base="aen-shift_${environment}_${timestamp}_${run_id}.dump"
destination="$BACKUP_DIRECTORY/$base"
partial="$BACKUP_DIRECTORY/.$base.partial.$$"
failure_reason=pg_dump_failed
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges --file "$partial"; then
  record_failure 70
fi
chmod 600 "$partial"
failure_reason=empty_backup
[ -s "$partial" ] || record_failure 74
failure_reason=unreadable_custom_archive
pg_restore --list "$partial" >/dev/null 2>&1 || record_failure 65
mv "$partial" "$destination"
partial=''
chmod 600 "$destination"
ops_assert_private_file "$destination"
checksum_file="$destination.sha256"
failure_reason=checksum_failed
ops_sha256_create "$destination" "$checksum_file"
ops_assert_private_file "$checksum_file"
ops_sha256_verify "$destination" "$checksum_file"

failure_reason=retention_failed
BACKUP_DIRECTORY="$BACKUP_DIRECTORY" BACKUP_ENVIRONMENT="$environment" BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-7}" "$SCRIPT_DIRECTORY/retention.sh" >/dev/null 2>&1 || record_failure 74
checksum=$(awk 'NR == 1 {print $1}' "$checksum_file")
if [ "${OFFHOST_COPY_ENABLED:-false}" = true ]; then
  "$SCRIPT_DIRECTORY/offhost-copy.sh" "$destination" >/dev/null 2>&1 || record_failure 75
fi
python3 "$SCRIPT_DIRECTORY/status.py" finish backup "$run_id" 0 "$destination" "$checksum"
trap - EXIT HUP INT TERM
printf '%s\n' "$destination"
