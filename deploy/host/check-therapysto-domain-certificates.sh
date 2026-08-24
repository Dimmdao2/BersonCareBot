#!/usr/bin/env bash
# Read-only daily DNS/TLS monitor; install only with cronport (see runbook).
set -euo pipefail
map=${1:?usage: check-therapysto-domain-certificates.sh HOST_MAP}
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
bash deploy/host/therapysto-domain-cutover.sh --host-map "$map" --offline --render "$tmp" >/dev/null
# shellcheck disable=SC1090
source "$map"
for host in "$STAFF_HOST" "$PLATFORM_ADMIN_HOST" "$PATIENT_DEFAULT_HOST" "$PATIENT_BRANDED_HOST" "$CLINIC_CUSTOM_HOST"; do
  getent ahosts "$host" >/dev/null || { echo "FAIL DNS $host"; exit 1; }
  expiry=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate) || { echo "FAIL TLS $host"; exit 1; }
  echo "$host $expiry"
done
