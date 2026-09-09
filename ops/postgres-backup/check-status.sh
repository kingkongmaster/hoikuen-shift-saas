#!/bin/sh
set -eu
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
status=0
python3 "$SCRIPT_DIRECTORY/status.py" check || status=$?
adapter=${NOTIFICATION_ADAPTER:-}
if [ -z "$adapter" ]; then
  echo 'WARNING: notification adapter is not configured' >&2
elif [ "${adapter#/}" = "$adapter" ] || [ ! -x "$adapter" ]; then
  echo 'SYSTEM_SAFETY_BLOCK: notification adapter must be an absolute executable' >&2
  exit 64
elif [ "$status" -ne 0 ]; then
  "$adapter" CRITICAL AEN_SHIFT_BACKUP 'Backup or restore status requires attention' || exit 75
fi
exit "$status"
