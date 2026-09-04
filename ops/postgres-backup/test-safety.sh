#!/bin/sh

set -eu
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/aen-shift-backup-test.XXXXXX")
trap 'rm -rf "$test_root"' EXIT HUP INT TERM

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    printf '%s\n' "expected failure but command succeeded: $*" >&2
    exit 1
  fi
}

expect_failure env BACKUP_DIRECTORY=/ BACKUP_ENVIRONMENT=test "$SCRIPT_DIRECTORY/retention.sh"
expect_failure env BACKUP_DIRECTORY=relative BACKUP_ENVIRONMENT=test "$SCRIPT_DIRECTORY/retention.sh"
expect_failure env BACKUP_DIRECTORY="$test_root/retention" BACKUP_ENVIRONMENT=test BACKUP_RETENTION_COUNT=6 "$SCRIPT_DIRECTORY/retention.sh"

backup_directory="$test_root/retention"
BACKUP_DIRECTORY="$backup_directory" BACKUP_ENVIRONMENT=test BACKUP_RETENTION_COUNT=7 "$SCRIPT_DIRECTORY/retention.sh" >/dev/null
index=1
while [ "$index" -le 9 ]; do
  timestamp=$(printf '202609%02dT020000Z' "$index")
  file="$backup_directory/aen-shift_test_${timestamp}.dump"
  printf 'test archive %s\n' "$index" >"$file"
  chmod 600 "$file"
  index=$((index + 1))
done
printf 'must remain\n' >"$backup_directory/unrelated.txt"
BACKUP_DIRECTORY="$backup_directory" BACKUP_ENVIRONMENT=test BACKUP_RETENTION_COUNT=7 "$SCRIPT_DIRECTORY/retention.sh" >/dev/null
[ "$(find "$backup_directory" -type f -name '*.dump' | wc -l | tr -d ' ')" = 7 ]
[ -f "$backup_directory/aen-shift_test_20260909T020000Z.dump" ]
[ -f "$backup_directory/unrelated.txt" ]

expect_failure env TEST_DATABASE_ISOLATED=false PGHOST=127.0.0.1 PGDATABASE=source RESTORE_DATABASE=safe_restore_test BACKUP_FILE=/missing "$SCRIPT_DIRECTORY/restore-verify.sh"
expect_failure env TEST_DATABASE_ISOLATED=true PGHOST=example.com PGDATABASE=source RESTORE_DATABASE=safe_restore_test BACKUP_FILE=/missing "$SCRIPT_DIRECTORY/restore-verify.sh"
expect_failure env TEST_DATABASE_ISOLATED=true PGHOST=127.0.0.1 PGDATABASE=source RESTORE_DATABASE=production_restore_test BACKUP_FILE=/missing "$SCRIPT_DIRECTORY/restore-verify.sh"
expect_failure env TEST_DATABASE_ISOLATED=true PGHOST=127.0.0.1 PGDATABASE=source RESTORE_DATABASE=source BACKUP_FILE=/missing "$SCRIPT_DIRECTORY/restore-verify.sh"
printf '%s\n' 'backup safety tests passed'
