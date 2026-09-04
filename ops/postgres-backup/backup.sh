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

status_directory="$BACKUP_DIRECTORY/status"
mkdir -p "$status_directory"
chmod 700 "$status_directory"
status_file="$status_directory/latest.env"
success_file="$status_directory/last-success.env"
failure_file="$status_directory/last-failure.env"
log_file="$status_directory/operations.log"
touch "$log_file"
chmod 600 "$log_file"
partial=''

record_failure() {
  exit_code=${1:-1}
  trap - EXIT HUP INT TERM
  reason=${failure_reason:-backup_command_failed}
  rm -f -- "${partial:-}"
  {
    printf 'status=FAILURE\n'
    printf 'environment=%s\n' "$environment"
    printf 'lastFailureAt=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'lastFailureReason=%s\n' "$reason"
  } >"$failure_file"
  cp "$failure_file" "$status_file"
  chmod 600 "$failure_file"
  chmod 600 "$status_file"
  ops_log "backup failure: environment=$environment reason=$reason" >>"$log_file"
  exit "$exit_code"
}
trap 'record_failure $?' EXIT
trap 'record_failure 130' HUP INT TERM

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
base="aen-shift_${environment}_${timestamp}.dump"
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
BACKUP_DIRECTORY="$BACKUP_DIRECTORY" BACKUP_ENVIRONMENT="$environment" BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-7}" "$SCRIPT_DIRECTORY/retention.sh" >>"$log_file" 2>&1 || record_failure
{
  printf 'status=SUCCESS\n'
  printf 'environment=%s\n' "$environment"
  printf 'lastSuccessAt=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'lastBackupFile=%s\n' "$base"
} >"$success_file"
cp "$success_file" "$status_file"
chmod 600 "$success_file" "$status_file"
ops_log "backup success: environment=$environment file=$base" >>"$log_file"
trap - EXIT HUP INT TERM
printf '%s\n' "$destination"
