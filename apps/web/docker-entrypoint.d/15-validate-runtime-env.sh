#!/bin/sh
set -eu

case "${PORT:-}" in
  ''|*[!0-9]*) echo "PORT must be numeric." >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then echo "PORT must be between 1 and 65535." >&2; exit 1; fi
if [ "$(printf '%s' "${API_UPSTREAM:-}" | tr -d '\r\n')" != "${API_UPSTREAM:-}" ] || ! printf '%s' "${API_UPSTREAM:-}" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
  echo "API_UPSTREAM must be an HTTP(S) origin without a path." >&2
  exit 1
fi
authority=${API_UPSTREAM#*://}
case "$authority" in
  *:*) upstream_port=${authority##*:}; if [ "$upstream_port" -lt 1 ] || [ "$upstream_port" -gt 65535 ]; then echo "API_UPSTREAM port is invalid." >&2; exit 1; fi ;;
esac
