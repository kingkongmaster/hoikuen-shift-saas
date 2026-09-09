#!/bin/sh
# Read-only Linux host preflight. Does not change the approved input.
set -eu
fail() { echo 'SYSTEM_SAFETY_BLOCK:ROSTER_HOST:unsafe input directory or file' >&2; exit 77; }
[ "$(uname -s)" = Linux ] || fail
input=${MUSUBI_ROSTER_DIRECTORY:-}
[ "$input" = /opt/aen-shift/roster ] || fail
for item in /opt /opt/aen-shift "$input" "$input/roster.json"; do
  [ ! -L "$item" ] && [ -e "$item" ] || fail
  [ "$(stat -c %u "$item")" = 0 ] || fail
  mode=$(stat -c %a "$item")
  case "$mode" in 700|750|755|640) ;; *) fail ;; esac
done
[ -d "$input" ] && [ -f "$input/roster.json" ] || fail
[ "$(stat -c '%a:%g' "$input")" = '750:20001' ] || fail
[ "$(stat -c '%a:%g:%h' "$input/roster.json")" = '640:20001:1' ] || fail
echo 'roster host permissions verified (content not read)'
