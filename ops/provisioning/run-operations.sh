#!/bin/sh
set -eu
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export MUSUBI_ROSTER_DIRECTORY=${MUSUBI_ROSTER_DIRECTORY:-/opt/aen-shift/roster}
"$SCRIPT_DIRECTORY/verify-roster-host.sh"
exec docker compose --env-file /opt/aen-shift/.env -f /opt/aen-shift/current/compose.musubi-beta.yaml --profile operations run --rm operations "$@"
