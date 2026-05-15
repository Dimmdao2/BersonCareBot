#!/usr/bin/env bash
set -euo pipefail

# Legacy webapp SQL folder is emergency-only.
# Regular deploy path runs Drizzle migrations from db/drizzle-migrations.
# Guardrail: block introducing new legacy files with a higher numeric prefix.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../migrations"
MAX_ALLOWED_PREFIX=87

shopt -s nullglob
for path in "${MIGRATIONS_DIR}"/*.sql; do
  file="$(basename "${path}")"
  if [[ "${file}" =~ ^([0-9]{3})_.*\.sql$ ]]; then
    prefix="${BASH_REMATCH[1]}"
    prefix_num=$((10#${prefix}))
    if (( prefix_num > MAX_ALLOWED_PREFIX )); then
      echo "check-legacy-migrations-frozen: found new legacy migration ${file}" >&2
      echo "Use Drizzle migration instead: apps/webapp/db/drizzle-migrations/*.sql" >&2
      echo "If this is an emergency-only legacy runbook migration, coordinate explicit exception first." >&2
      exit 1
    fi
  fi
done
