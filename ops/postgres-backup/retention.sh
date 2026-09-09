#!/bin/sh

set -eu
umask 077
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

ops_prepare_backup_directory "${BACKUP_DIRECTORY:-}"
ops_safe_slug "${BACKUP_ENVIRONMENT:-}" 'BACKUP_ENVIRONMENT'
keep=${BACKUP_RETENTION_COUNT:-7}
case "$keep" in ''|*[!0-9]*) ops_die 'BACKUP_RETENTION_COUNT must be an integer' 64 ;; esac
[ "$keep" -ge 7 ] || ops_die 'BACKUP_RETENTION_COUNT must be at least 7' 64

list_file=$(mktemp "${TMPDIR:-/tmp}/aen-shift-retention.XXXXXX")
trap 'rm -f "$list_file"' EXIT HUP INT TERM
find "$BACKUP_DIRECTORY" -maxdepth 1 -type f -name "aen-shift_${BACKUP_ENVIRONMENT}_[0-9]*T[0-9]*Z*.dump" -print | LC_ALL=C sort -r >"$list_file"
total=$(wc -l <"$list_file" | tr -d ' ')
if [ "$total" -le "$keep" ]; then
  ops_log "retention complete: kept=$total deleted=0"
  exit 0
fi

deleted=0
line_number=0
while IFS= read -r candidate; do
  line_number=$((line_number + 1))
  [ "$line_number" -gt "$keep" ] || continue
  case "$candidate" in "$BACKUP_DIRECTORY"/*) ;; *) ops_die 'retention candidate escaped backup directory' 77 ;; esac
  [ ! -L "$candidate" ] || ops_die 'retention refuses symbolic links' 77
  rm -f -- "$candidate" "$candidate.sha256" "$candidate.age" "$candidate.age.sha256"
  deleted=$((deleted + 1))
done <"$list_file"
ops_log "retention complete: kept=$keep deleted=$deleted"
