#!/bin/sh

set -eu
umask 077
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

backup_file=${1:-}
[ -n "$backup_file" ] || ops_die 'backup file argument is required' 64
case "$backup_file" in /*) ;; *) ops_die 'backup file must be absolute' 64 ;; esac
ops_assert_private_file "$backup_file"
ops_assert_private_file "$backup_file.sha256"
recipient=${BACKUP_ENCRYPTION_RECIPIENT:-}
[ -n "$recipient" ] || ops_die 'BACKUP_ENCRYPTION_RECIPIENT is required when off-host copy is enabled' 64
adapter=${OFFHOST_UPLOAD_ADAPTER:-}
case "$adapter" in /*) ;; *) ops_die 'OFFHOST_UPLOAD_ADAPTER must be an absolute executable path' 64 ;; esac
[ -x "$adapter" ] || ops_die 'OFFHOST_UPLOAD_ADAPTER is not executable' 69
ops_require_command age

encrypted="$backup_file.age"
partial="$encrypted.partial.$$"
trap 'rm -f -- "$partial"' EXIT HUP INT TERM
age --recipient "$recipient" --output "$partial" "$backup_file"
chmod 600 "$partial"
mv "$partial" "$encrypted"
trap - EXIT HUP INT TERM
ops_assert_private_file "$encrypted"
ops_sha256_create "$encrypted" "$encrypted.sha256"
ops_assert_private_file "$encrypted.sha256"
if ! "$adapter" "$encrypted" "$encrypted.sha256"; then
  ops_die 'off-host upload adapter failed; local backup remains available' 75
fi
ops_log "off-host encrypted copy completed: file=$(basename "$encrypted")"
