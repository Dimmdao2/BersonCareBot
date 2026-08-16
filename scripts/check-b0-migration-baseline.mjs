#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webappMigrations = resolve(root, 'apps/webapp/db/drizzle-migrations');
const integratorRoot = resolve(root, 'apps/integrator/src');

function files(directory, suffix) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
}

function relative(path) {
  return path.slice(root.length + 1);
}

const webappSql = files(webappMigrations, '.sql').map(relative).sort();
const integratorSql = files(integratorRoot, '.sql')
  .filter((path) => path.includes('/db/migrations/'))
  .map(relative)
  .sort();
const webappBaseline = 'apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql';
const integratorBaseline =
  'apps/integrator/src/infra/db/migrations/core/20260816_0000_b0_baseline.sql';
if (webappSql[0] !== webappBaseline || integratorSql[0] !== integratorBaseline) {
  throw new Error('the active migration roots must start at the canonical B0 baselines');
}
const invalidIntegratorForward = integratorSql.slice(1).filter((path) => {
  const name = path.split('/').at(-1) ?? '';
  return !/^20\d{6}_\d{4}_[a-z0-9_]+\.sql$/.test(name) || name <= '20260816_0000_b0_baseline.sql';
});
if (invalidIntegratorForward.length > 0) {
  throw new Error(
    `integrator migrations before/at B0 or with invalid names are forbidden: ${invalidIntegratorForward.join(',')}`,
  );
}

const legacySql = files(resolve(root, 'apps/webapp'), '.sql')
  .map(relative)
  .filter((path) => path.startsWith('apps/webapp/migrations/'));
if (legacySql.length > 0) {
  throw new Error(`legacy webapp migration SQL is forbidden: ${legacySql.join(',')}`);
}

const journal = JSON.parse(readFileSync(resolve(webappMigrations, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries ?? [];
if (journal.version !== '7' || journal.dialect !== 'postgresql') {
  throw new Error('Drizzle journal header must remain canonical');
}
if (
  entries[0]?.idx !== 0 ||
  entries[0]?.when !== 1800000000000 ||
  entries[0]?.tag !== '0000_b0_baseline'
) {
  throw new Error('Drizzle journal must start at the canonical B0 marker');
}
for (const [index, entry] of entries.entries()) {
  if (
    entry.idx !== index ||
    !Number.isSafeInteger(entry.when) ||
    (index > 0 && entry.when <= entries[index - 1].when) ||
    !/^[0-9]{4}_[a-z0-9_]+$/.test(entry.tag)
  ) {
    throw new Error(`invalid post-B0 Drizzle journal entry at index=${index}`);
  }
}
const journalSql = entries.map(
  (entry) => `apps/webapp/db/drizzle-migrations/${entry.tag}.sql`,
);
if (JSON.stringify(webappSql) !== JSON.stringify(journalSql)) {
  throw new Error(
    `webapp migration SQL must match the B0-forward journal; files=${webappSql.join(',')}`,
  );
}

const journalIndexes = new Set(entries.map((entry) => entry.idx));
const invalidSnapshots = files(resolve(webappMigrations, 'meta'), '_snapshot.json')
  .map(relative)
  .filter((path) => {
    const match = path.match(/\/([0-9]{4})_snapshot\.json$/);
    return !match || !journalIndexes.has(Number(match[1]));
  });
if (invalidSnapshots.length > 0) {
  throw new Error(`pre-B0 or orphan Drizzle snapshots are forbidden: ${invalidSnapshots.join(',')}`);
}

// The maintained migration surface is B0 + forwards only.  This checks executable topology
// (not prose wording): an A0/disposable bootstrap or a prebuilt PROD target is an alternate
// migration path even when no migration journal references it.
const forbiddenExecutablePaths = [
  'deploy/postgres/generated/prod-to-target',
  'deploy/postgres/prod-to-target-cutover.sql',
  'deploy/postgres/prod-to-target-cutover-data.sql',
  'scripts/prod-to-target-cutover-executable-gate.mjs',
  'apps/integrator/src/infra/scripts/d30DisposablePostgres.ts',
  'apps/webapp/scripts/patient-invites-disposable-proof.mjs',
];
const presentForbiddenPaths = forbiddenExecutablePaths.filter((path) => {
  try {
    readdirSync(resolve(root, path));
    return true;
  } catch {
    try {
      readFileSync(resolve(root, path));
      return true;
    } catch {
      return false;
    }
  }
});
if (presentForbiddenPaths.length > 0) {
  throw new Error(`B0 checkout contains an alternate executable migration path: ${presentForbiddenPaths.join(', ')}`);
}

console.log(
  `check-b0-migration-baseline: OK (B0 roots + ${entries.length - 1} webapp and ${integratorSql.length - 1} integrator forward migrations; no legacy chain)`,
);
