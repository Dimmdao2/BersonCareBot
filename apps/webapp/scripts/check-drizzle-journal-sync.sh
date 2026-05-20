#!/usr/bin/env bash
# Ensures every db/drizzle-migrations/*.sql (except meta/) has a matching tag in meta/_journal.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIG_DIR="${ROOT}/db/drizzle-migrations"
JOURNAL="${MIG_DIR}/meta/_journal.json"

if [[ ! -f "${JOURNAL}" ]]; then
  echo "check-drizzle-journal-sync: missing ${JOURNAL}" >&2
  exit 1
fi

missing=0
for sql in "${MIG_DIR}"/*.sql; do
  base="$(basename "${sql}" .sql)"
  if ! grep -q "\"tag\": \"${base}\"" "${JOURNAL}"; then
    echo "check-drizzle-journal-sync: ${base}.sql not in _journal.json" >&2
    missing=1
  fi
done

if (( missing != 0 )); then
  echo "Add the migration via drizzle-kit generate or append an entry to meta/_journal.json." >&2
  exit 1
fi

echo "check-drizzle-journal-sync: OK"
