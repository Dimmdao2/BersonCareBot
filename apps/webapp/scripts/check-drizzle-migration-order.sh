#!/usr/bin/env bash
# The order of db/drizzle-migrations is the file name, and nothing else.
#
# It used to be the file name AND meta/_journal.json's `when`, and this check enforced that the two
# agreed. Two places for one fact is what made merging branches a hand-edit: on 19.08 the journal was
# corrected by hand three times, and one of those corrections dropped a migration on TEST. The
# runners now read the folder listing, so there is nothing left to keep in sync — what is checked
# here is that every name is either one the frozen legacy snapshot already knows (kept forever,
# whatever shape it has) or a timestamp (`findMigrationNameViolations` in migration-order.mjs, the
# same module both runners apply from), that the live journal itself still points at real files, and
# that the live journal has not grown a name the frozen snapshot does not carry (`findJournalGrowth`
# — on the night of 19/20.08 a branch added a 51st entry to the live journal to relabel its own
# hand-numbered migration as "legacy", and this check, reading only the live file at the time, passed
# it; the frozen snapshot is a second, checked-in-only copy so growing the live file cannot also grow
# what it is checked against).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ROOT}/../.." && pwd)"
MIG_DIR="${ROOT}/db/drizzle-migrations"
JOURNAL="${MIG_DIR}/meta/_journal.json"
MIGRATION_ORDER_MODULE="${REPO_ROOT}/deploy/postgres/privileges/migration-order.mjs"

failed=0

node --input-type=module - "${MIG_DIR}" "${JOURNAL}" "${MIGRATION_ORDER_MODULE}" <<'NODE' || failed=1
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [migrationsDir, journalPath, moduleFile] = process.argv.slice(2);
const { findJournalGrowth, findMigrationNameViolations, readFrozenLegacyMigrationNames, readMigrationFolder } =
  await import(pathToFileURL(moduleFile));

const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, 'utf8')) : { entries: [] };
const entries = journal.entries ?? [];
const frozenEntries = readFrozenLegacyMigrationNames(migrationsDir);
let failed = false;

const grown = findJournalGrowth(entries, frozenEntries);
for (const tag of grown) {
  console.error(
    `check-drizzle-migration-order: meta/_journal.json carries ${tag}, which meta/_journal.frozen.json ` +
      'does not know; the closed legacy-name list grew — revert the journal edit, or grandfather the name ' +
      'in meta/_journal.frozen.json in its own reviewed diff',
  );
  failed = true;
}

const violations = findMigrationNameViolations(readMigrationFolder(migrationsDir), frozenEntries);
for (const tag of violations) {
  console.error(
    `check-drizzle-migration-order: ${tag}.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the ` +
      'frozen legacy snapshot does not know it as a legacy name',
  );
  failed = true;
}

const seenTags = new Set();
const seenWhens = new Set();
for (const entry of entries) {
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
        'an applied migration was deleted or renamed',
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
NODE

if (( failed != 0 )); then
  echo "New migrations are named db/drizzle-migrations/YYYYMMDDTHHMMSS_name.sql (UTC); nothing hands out a number." >&2
  echo "meta/_journal.frozen.json is the closed legacy-name allowlist; meta/_journal.json is live ledger-backfill bookkeeping only." >&2
  exit 1
fi

node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-online-index-layout

echo "check-drizzle-migration-order: OK"
