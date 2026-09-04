#!/bin/sh

set -eu

ops_die() {
  printf '%s\n' "ERROR: $1" >&2
  exit "${2:-1}"
}

ops_log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"
}

ops_require_command() {
  command -v "$1" >/dev/null 2>&1 || ops_die "required command is unavailable: $1" 69
}

ops_safe_slug() {
  case "$1" in
    ''|*[!A-Za-z0-9_-]*) ops_die "$2 must contain only letters, numbers, underscore, or hyphen" 64 ;;
  esac
}

ops_prepare_backup_directory() {
  directory=$1
  [ -n "$directory" ] || ops_die 'BACKUP_DIRECTORY is required' 64
  case "$directory" in /*) ;; *) ops_die 'BACKUP_DIRECTORY must be absolute' 64 ;; esac
  [ "$directory" != '/' ] || ops_die 'refusing filesystem root as BACKUP_DIRECTORY' 64
  [ "$directory" != "${HOME:-__unset__}" ] || ops_die 'refusing home directory as BACKUP_DIRECTORY' 64
  [ ! -L "$directory" ] || ops_die 'BACKUP_DIRECTORY must not be a symbolic link' 64
  mkdir -p "$directory"
  chmod 700 "$directory"
  marker="$directory/.aen-shift-backup-root"
  if [ ! -e "$marker" ]; then
    printf '%s\n' 'AeN Shift PostgreSQL backup directory v1' >"$marker"
    chmod 600 "$marker"
  fi
  [ -f "$marker" ] || ops_die 'backup directory marker is missing or invalid' 64
  marker_value=$(sed -n '1p' "$marker")
  [ "$marker_value" = 'AeN Shift PostgreSQL backup directory v1' ] || ops_die 'backup directory marker does not match' 64
}

ops_assert_private_file() {
  file=$1
  [ -f "$file" ] || ops_die "expected file does not exist: $(basename "$file")" 74
  mode=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || true)
  [ "$mode" = '600' ] || ops_die "unsafe file permission for $(basename "$file"): expected 600, got ${mode:-unknown}" 77
}

ops_sha256_create() {
  source_file=$1
  checksum_file=$2
  if command -v sha256sum >/dev/null 2>&1; then
    checksum=$(sha256sum "$source_file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    checksum=$(shasum -a 256 "$source_file" | awk '{print $1}')
  else
    ops_die 'sha256sum or shasum is required' 69
  fi
  printf '%s  %s\n' "$checksum" "$(basename "$source_file")" >"$checksum_file"
  chmod 600 "$checksum_file"
}

ops_sha256_verify() {
  source_file=$1
  checksum_file=$2
  [ -f "$checksum_file" ] || ops_die 'checksum file is missing' 74
  expected=$(awk 'NR == 1 {print $1}' "$checksum_file")
  case "$expected" in ''|*[!0-9a-fA-F]*) ops_die 'checksum file is invalid' 65 ;; esac
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$source_file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$source_file" | awk '{print $1}')
  else
    ops_die 'sha256sum or shasum is required' 69
  fi
  [ "$actual" = "$expected" ] || ops_die 'backup checksum does not match' 65
}

ops_assert_local_restore_target() {
  [ "${TEST_DATABASE_ISOLATED:-}" = 'true' ] || ops_die 'restore requires TEST_DATABASE_ISOLATED=true' 77
  case "${PGHOST:-}" in 127.0.0.1|localhost) ;; *) ops_die 'restore host must be localhost or 127.0.0.1' 77 ;; esac
  target=${RESTORE_DATABASE:-}
  [ -n "$target" ] || ops_die 'RESTORE_DATABASE is required' 64
  ops_safe_slug "$target" 'RESTORE_DATABASE'
  case "$target" in
    *restore_test*|*restore_verify*) ;;
    *) ops_die 'RESTORE_DATABASE must contain restore_test or restore_verify' 77 ;;
  esac
  case "$target" in
    *prod*|*production*|musubi_final_isolated|enshift|postgres|template0|template1)
      ops_die 'restore target resembles a protected database' 77 ;;
  esac
  [ "$target" != "${PGDATABASE:-}" ] || ops_die 'restore target must differ from source database' 77
}
