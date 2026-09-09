#!/bin/sh

set -eu
public_origin=${PUBLIC_ORIGIN:-}
case "$public_origin" in https://*) ;; *) echo 'SYSTEM_SAFETY_BLOCK: PUBLIC_ORIGIN must be HTTPS' >&2; exit 64 ;; esac
for command in curl docker df free openssl; do command -v "$command" >/dev/null 2>&1 || { echo "SYSTEM_SAFETY_BLOCK: required command unavailable: $command" >&2; exit 69; }; done

failures=''
check_url() { curl --fail --silent --show-error --max-time 10 "$1" >/dev/null 2>&1 || failures="$failures $2"; }
check_url "$public_origin/" web
check_url "$public_origin/api/health" api-health
check_url "$public_origin/api/ready" api-ready

for container in ${MONITORED_CONTAINERS:-aen-shift-musubi-beta-edge-1 aen-shift-musubi-beta-web-1 aen-shift-musubi-beta-api-1 aen-shift-musubi-beta-postgres-1}; do
  state=$(docker inspect --format '{{.State.Status}}:{{.State.OOMKilled}}:{{.RestartCount}}' "$container" 2>/dev/null || true)
  case "$state" in running:false:0) ;; running:false:*) failures="$failures restart-$container" ;; *) failures="$failures container-$container" ;; esac
done

disk_percent=$(df -P "${MONITORED_PATH:-/var/lib/docker}" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
[ "${disk_percent:-100}" -lt "${DISK_CRITICAL_PERCENT:-85}" ] || failures="$failures disk"
available_kb=$(free -k | awk '/^Mem:/ {print $7}')
[ "${available_kb:-0}" -ge "${MEMORY_AVAILABLE_CRITICAL_KB:-262144}" ] || failures="$failures memory"

host=${public_origin#https://}; host=${host%%/*}; host=${host%%:*}
certificate=$(mktemp "${TMPDIR:-/tmp}/aen-shift-certificate.XXXXXX")
trap 'rm -f "$certificate"' EXIT HUP INT TERM
if ! echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -out "$certificate" 2>/dev/null; then
  failures="$failures certificate"
elif ! openssl x509 -checkend 1209600 -noout -in "$certificate" >/dev/null 2>&1; then
  failures="$failures certificate-expiry"
fi

if [ -n "$failures" ]; then
  message="production health check failed:$failures"
  adapter=${NOTIFICATION_ADAPTER:-}
  if [ -z "$adapter" ]; then echo "WARNING: notification adapter is not configured; $message" >&2; exit 2; fi
  case "$adapter" in /*) ;; *) echo 'SYSTEM_SAFETY_BLOCK: NOTIFICATION_ADAPTER must be absolute' >&2; exit 64 ;; esac
  [ -x "$adapter" ] || { echo 'SYSTEM_SAFETY_BLOCK: notification adapter is not executable' >&2; exit 64; }
  "$adapter" "CRITICAL" "AEN_SHIFT_HEALTH" "$message" || exit 75
  exit 2
fi
if [ -z "${NOTIFICATION_ADAPTER:-}" ]; then echo 'WARNING: notification adapter is not configured; checks are local only' >&2; fi
echo 'production health checks passed'
