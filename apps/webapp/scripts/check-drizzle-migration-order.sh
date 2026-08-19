#!/usr/bin/env bash
# The order of db/drizzle-migrations is the file name, and nothing else.
#
# It used to be the file name AND meta/_journal.json's `when`, and this check enforced that the two
# agreed. Two places for one fact is what made merging branches a hand-edit: on 19.08 the journal was
# corrected by hand three times, and one of those corrections dropped a migration on TEST. The
# runners now read the folder listing, so there is nothing left to keep in sync — what is checked
# here is that a file name can be sorted, and that the journal, which survives only as the frozen
# historical `when -> tag` map used to label pre-existing ledger rows, still points at real files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIG_DIR="${ROOT}/db/drizzle-migrations"
JOURNAL="${MIG_DIR}/meta/_journal.json"

failed=0
shopt -s nullglob
for sql in "${MIG_DIR}"/*.sql; do
  base="$(basename "${sql}" .sql)"
  # Four digits first, so the listing sorts the way a human reads it; a suffix letter is how a
  # migration slots between two already-applied ones without renaming either.
  # Две схемы, обе законные. NNNN[suffix]_ — историческая: так названы уже применённые миграции,
  # переименовывать их нельзя, тег в леджере привязан к имени. YYYYMMDDTHHMMSS_ — канон для новых
  # (решение владельца 20.08): рукописный номер при параллельных ветках даёт коллизии, время — нет.
  if [[ ! "${base}" =~ ^[0-9]{4}[a-z0-9]*_[a-z0-9_]+$ && ! "${base}" =~ ^[0-9]{8}T[0-9]{6}_[a-z0-9_]+$ ]]; then
    echo "check-drizzle-migration-order: ${base}.sql is named neither NNNN[suffix]_lower_snake_case nor YYYYMMDDTHHMMSS_lower_snake_case" >&2
    failed=1
  fi
done

if [[ -f "${JOURNAL}" ]]; then
  node - "${JOURNAL}" "${MIG_DIR}" <<'NODE' || failed=1
const fs = require("node:fs");
const path = require("node:path");

const [journalPath, migrationsDir] = process.argv.slice(2);
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const seenTags = new Set();
const seenWhens = new Set();
let failed = false;

for (const entry of journal.entries ?? []) {
  if (seenTags.has(entry.tag)) {
    console.error(`check-drizzle-migration-order: duplicate tag ${entry.tag} in the historical map`);
    failed = true;
  }
  if (seenWhens.has(entry.when)) {
    console.error(
      `check-drizzle-migration-order: two entries claim when=${entry.when}; one ledger row cannot get two names`,
    );
    failed = true;
  }
  seenTags.add(entry.tag);
  seenWhens.add(entry.when);
  if (!fs.existsSync(path.join(migrationsDir, `${entry.tag}.sql`))) {
    console.error(
      `check-drizzle-migration-order: the historical map names ${entry.tag}, which has no .sql file; ` +
        "an applied migration was deleted or renamed",
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
NODE
fi

if (( failed != 0 )); then
  echo "Order comes from the file name: add db/drizzle-migrations/NNNN_name.sql and nothing else." >&2
  echo "meta/_journal.json is the frozen historical map; do not hand-edit it to reorder anything." >&2
  exit 1
fi

node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-online-index-layout

echo "check-drizzle-migration-order: OK"
