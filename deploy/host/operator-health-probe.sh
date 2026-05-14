#!/usr/bin/env bash
# Periodic trigger for integrator synthetic probes (MAX + Rubitime).
# Endpoint: POST /internal/operator-health-probe (signed with INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET).
#
# Production: source /opt/env/bersoncarebot/api.prod (see docs/ARCHITECTURE/SERVER CONVENTIONS.md), then run from cron/systemd.
set -euo pipefail

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
