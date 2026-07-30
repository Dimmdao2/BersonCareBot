#!/usr/bin/env bash
# Periodic trigger for integrator synthetic probes.
# Endpoint: POST /internal/operator-health-probe (signed with INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET).
#
# Production: source /opt/env/bersoncarebot/api.prod (see docs/ARCHITECTURE/SERVER CONVENTIONS.md), then run from cron/systemd.
set -euo pipefail

fail() {
  echo "operator-health-probe: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD health probe on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing PROD health probe without local IPv4 135.106.162.170"
}

assert_canonical_prod_host

if [[ -f /opt/env/bersoncarebot/api.prod ]]; then
  set -a
  # shellcheck source=/dev/null
  source /opt/env/bersoncarebot/api.prod
  set +a
fi

INTEGRATOR_API_URL="${INTEGRATOR_API_URL:-http://127.0.0.1:3200}"
BODY="${OPERATOR_HEALTH_PROBE_BODY:-{}}"

SECRET="${INTEGRATOR_WEBHOOK_SECRET:-${INTEGRATOR_SHARED_SECRET:-}}"
if [[ -z "$SECRET" ]] || [[ "${#SECRET}" -lt 16 ]]; then
  echo "operator-health-probe: INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET (>=16 chars) must be set" >&2
  exit 1
fi

TS="$(date +%s)"
export TS BODY SECRET
SIG="$(
  node <<'NODE'
const crypto = require('node:crypto');
const ts = process.env.TS;
const body = process.env.BODY;
const secret = process.env.SECRET;
if (!ts || secret === undefined) process.exit(2);
process.stdout.write(
  crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64url'),
);
NODE
)"

curl -fsS -X POST "${INTEGRATOR_API_URL%/}/internal/operator-health-probe" \
  -H 'Content-Type: application/json' \
  -H "x-bersoncare-timestamp: ${TS}" \
  -H "x-bersoncare-signature: ${SIG}" \
  -d "${BODY}"
