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

node - "${JOURNAL}" <<'NODE'
const fs = require("node:fs");

const journalPath = process.argv[2];
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
let previous = null;
const indexes = new Set();
const tags = new Set();

for (const [arrayIndex, entry] of journal.entries.entries()) {
  if (entry.idx !== arrayIndex) {
    console.error(
      `check-drizzle-journal-sync: entry ${entry.tag} has idx ${entry.idx}; expected array position ${arrayIndex}`,
    );
    process.exit(1);
  }
  if (indexes.has(entry.idx)) {
    console.error(`check-drizzle-journal-sync: duplicate idx ${entry.idx}`);
    process.exit(1);
  }
  if (tags.has(entry.tag)) {
    console.error(`check-drizzle-journal-sync: duplicate tag ${entry.tag}`);
    process.exit(1);
  }
  indexes.add(entry.idx);
  tags.add(entry.tag);
  if (previous !== null && entry.when <= previous.when) {
    console.error(
      `check-drizzle-journal-sync: journal when values must be strictly increasing by idx; ` +
        `idx ${entry.idx} (${entry.when}) is not greater than idx ${previous.idx} (${previous.when})`,
    );
    process.exit(1);
  }
  previous = entry;
}
NODE

missing=0
for sql in "${MIG_DIR}"/*.sql; do
  base="$(basename "${sql}" .sql)"
  # Parallel worktrees may carry one explicitly marked temporary high migration while the lead
  # assigns the final number/journal position during merge. It is intentionally not runnable yet.
  if [[ "${base}" == 9999_* ]] && head -n 1 "${sql}" | grep -q '^-- TEMPORARY HIGH LOCAL NUMBER'; then
    continue
  fi
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
