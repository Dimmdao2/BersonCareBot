#!/usr/bin/env bash
# run_all.sh — execute all 5 spike proofs against bcb_saas_spike
# Usage: bash docs/SAAS_FOUNDATION/spike/run_all.sh  (from repo root)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DBU=$(grep -m1 -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
SPIKE_URL="${DBU%/*}/bcb_saas_spike"

sanity=$(timeout 10 psql "$SPIKE_URL" -At -c "select current_database();")
if [[ "$sanity" != "bcb_saas_spike" ]]; then
  echo "FATAL: spike DB sanity check failed (got: $sanity)"
  exit 1
fi
echo "=== Spike DB OK: $sanity ==="

run_proof() {
  local n="$1" label="$2" file="$3"
  echo ""
  echo "=== PROOF $n: $label ==="
  time timeout 60 psql "$SPIKE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/$file"
  echo "--- PROOF $n DONE ---"
}

run_proof 1 "Provision from template"       01_provision.sql
run_proof 2 "Migration loop"                02_migration_loop.sql
run_proof 3 "Isolation via search_path"     03_isolation.sql
run_proof 4 "Global directory + enrollment" 04_directory.sql
run_proof 5 "Transfer + headless job"       05_transfer_headless.sql

echo ""
echo "=== ALL PROOFS COMPLETE ==="
