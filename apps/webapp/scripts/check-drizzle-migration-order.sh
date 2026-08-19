#!/usr/bin/env bash
# The order of db/drizzle-migrations is the file name, and nothing else.
#
# It used to be the file name AND meta/_journal.json's `when`, and this check enforced that the two
# agreed. Two places for one fact is what made merging branches a hand-edit: on 19.08 the journal was
# corrected by hand three times, and one of those corrections dropped a migration on TEST. The
# runners now read the folder listing, so there is nothing left to keep in sync — what is checked
# here is that every name is either one the frozen historical journal already knows (kept forever,
# whatever shape it has) or a timestamp (`findMigrationNameViolations` in migration-order.mjs, the
# same module both runners apply from), and that the journal itself still points at real files.
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
const { findMigrationNameViolations, readMigrationFolder } = await import(pathToFileURL(moduleFile));

const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, 'utf8')) : { entries: [] };
const entries = journal.entries ?? [];
let failed = false;

const violations = findMigrationNameViolations(readMigrationFolder(migrationsDir), entries);
for (const tag of violations) {
  console.error(
    `check-drizzle-migration-order: ${tag}.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the ` +
      'frozen historical journal does not know it as a legacy name',
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
  echo "meta/_journal.json is the frozen historical map: it names the legacy NNNN files and nothing new." >&2
  exit 1
fi

node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-online-index-layout

echo "check-drizzle-migration-order: OK"
