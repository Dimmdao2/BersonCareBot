#!/usr/bin/env bash
# Read-only daily DNS/TLS monitor; install only with cronport (see runbook).
set -euo pipefail
map=${1:?usage: check-therapysto-domain-certificates.sh HOST_MAP}
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
bash "$root/deploy/host/therapysto-domain-cutover.sh" --host-map "$map" --offline --render "$tmp" >/dev/null
value() { awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2); exit }' "$map"; }
expected=$(value EXPECTED_DNS_TARGET); warn_days=$(value CERT_EXPIRY_WARN_DAYS); warn_seconds=$((warn_days * 86400))
hosts=("$(value STAFF_HOST)" "$(value PLATFORM_ADMIN_HOST)" "$(value PATIENT_DEFAULT_HOST)" "$(value PATIENT_BRANDED_HOST)" "$(value CLINIC_CUSTOM_HOST)")
if [[ "$expected" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then approved=$expected; else approved=$(getent ahostsv4 "$expected" | awk 'NR == 1 { print $1 }'); fi
[[ -n "$approved" ]] || { echo "FAIL approved DNS target $expected" >&2; exit 1; }
for host in "${hosts[@]}"; do
  answers=$(getent ahostsv4 "$host" | awk '{print $1}' | sort -u) || { echo "FAIL DNS $host" >&2; exit 1; }
  [[ "$answers" == "$approved" ]] || { echo "FAIL DNS drift $host expected=$approved actual=${answers:-none}" >&2; exit 1; }
  cert=$(mktemp)
  if ! echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -out "$cert"; then echo "FAIL TLS $host" >&2; rm -f "$cert"; exit 1; fi
  if ! openssl x509 -in "$cert" -noout -checkhost "$host" >/dev/null; then echo "FAIL certificate name $host" >&2; rm -f "$cert"; exit 1; fi
  expiry=$(openssl x509 -in "$cert" -noout -enddate)
  expiry_epoch=$(date -u -d "${expiry#notAfter=}" +%s 2>/dev/null) || { echo "FAIL certificate expiry parse $host" >&2; rm -f "$cert"; exit 1; }
  if (( expiry_epoch <= $(date -u +%s) + warn_seconds )); then echo "FAIL certificate expiry $host within ${warn_days}d" >&2; rm -f "$cert"; exit 1; fi
  rm -f "$cert"; echo "$host $expiry"
done
