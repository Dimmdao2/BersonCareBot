#!/usr/bin/env bash
# The order of db/drizzle-migrations is the file name, and nothing else.
#
# It used to be the file name AND meta/_journal.json's `when`, and this check enforced that the two
# agreed. Two places for one fact is what made merging branches a hand-edit: on 19.08 the journal was
# corrected by hand three times, and one of those corrections dropped a migration on TEST. The
# runners now read the folder listing, so there is nothing left to keep in sync — what is checked
# here is that every name is a timestamp (`findMigrationNameViolations` in migration-order.mjs, the
# same module both runners apply from) and that the live journal itself still points at real files.
# The historical chain and its legacy-name allowlist were retired on 20.08.2026; journal contents can
# no longer exempt a file from the timestamp rule.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ROOT}/../.." && pwd)"
MIG_DIR="${ROOT}/db/drizzle-migrations"
JOURNAL="${MIG_DIR}/meta/_journal.json"
MIGRATION_ORDER_MODULE="${REPO_ROOT}/deploy/postgres/privileges/migration-order.mjs"
PRIVILEGE_DECLARATION="${REPO_ROOT}/deploy/postgres/privileges/declaration.ts"

failed=0

(
cd "${REPO_ROOT}"
node --experimental-strip-types --input-type=module - \
  "${MIG_DIR}" "${JOURNAL}" "${MIGRATION_ORDER_MODULE}" "${PRIVILEGE_DECLARATION}" "${REPO_ROOT}" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [migrationsDir, journalPath, moduleFile, declarationFile, repoRoot] = process.argv.slice(2);
const { findMigrationStaticViolations, readMigrationFolder } = await import(pathToFileURL(moduleFile));
const { default: declaration } = await import(pathToFileURL(declarationFile));

const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, 'utf8')) : { entries: [] };
const entries = journal.entries ?? [];
let failed = false;

const migrations = readMigrationFolder(migrationsDir);
const declaredRelations = new Set([
  ...Object.keys(declaration.databases.bcb_webapp_dev.tables),
  ...Object.keys(declaration.portContext?.privateRelations ?? {}),
]);
for (const violation of findMigrationStaticViolations(migrations, declaredRelations)) {
  console.error(
    `check-drizzle-migration-order: ${path.relative(repoRoot, violation.file)} ` +
      `statement ${violation.statementIndex}: ${violation.reason}; ${violation.action}`,
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
) || failed=1

if (( failed != 0 )); then
  echo "New migrations are named db/drizzle-migrations/YYYYMMDDTHHMMSS_name.sql (UTC); nothing hands out a number." >&2
  echo "The historical name allowlist is retired; meta/_journal.json cannot exempt a migration." >&2
  exit 1
fi

node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-online-index-layout

echo "check-drizzle-migration-order: OK"
