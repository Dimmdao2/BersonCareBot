#!/usr/bin/env node
/**
 * Canonical webapp DB migration entrypoint (used by `pnpm run migrate`).
 *
 * It selects and applies through `deploy/postgres/privileges/migration-order.mjs`, the same module
 * the DEV/TEST wrapper uses: order is the file name, applied is a ledger row carrying that name.
 * The Drizzle ORM migrator is deliberately NOT used here — it applies `when > max(created_at)` from
 * `meta/_journal.json`, so a migration whose name lands below what is already applied would be
 * skipped silently and permanently on exactly the databases this entrypoint serves.
 *
 * PostgreSQL failures keep their structured SQLSTATE/cause. Diagnostics expose only the migration
 * tag, index and allowlisted category; SQL, parameters, connection strings and database data are
 * never rendered.
 */
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  collectExpectedObjects,
  describeObject,
  readLegacyJournalEntries,
  readMigrationFolder,
  renderLedgerBootstrapSql,
  renderObjectPresenceSql,
  selectPendingMigrations,
  splitStatements,
} from '../../../deploy/postgres/privileges/migration-order.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.join(__dirname, '..');
const migrationsFolder = path.join(webappRoot, 'db', 'drizzle-migrations');
const TRANSACTION_FORBIDDEN_CONCURRENT_INDEX = /\b(?:CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+CONCURRENTLY\b/iu;

const OBJECT_CONFLICT_SQLSTATES = new Set(['23505', '42701', '42710', '42P06', '42P07']);
const SCHEMA_MISMATCH_SQLSTATES = new Set(['3F000', '42703', '42883', '42P01']);

/**
 * `WEBAPP_MIGRATIONS_BEFORE_TAG` stops the run just before a named migration, in file-name order.
 * The bound is exclusive and must name a migration the folder actually has.
 */
export function selectMigrationPhase(migrations, beforeTag) {
  if (!beforeTag) return { migrations, bounded: false };
  if (!/^[0-9]{4}[a-z0-9]*_[a-z0-9_]+$/.test(beforeTag)) {
    throw new Error(`WEBAPP_MIGRATIONS_BEFORE_TAG invalid tag=${beforeTag}`);
  }
  const at = migrations.findIndex((migration) => migration.tag === beforeTag);
  if (at < 0) throw new Error(`WEBAPP_MIGRATIONS_BEFORE_TAG unknown tag=${beforeTag}`);
  if (at === 0) throw new Error(`WEBAPP_MIGRATIONS_BEFORE_TAG empty phase tag=${beforeTag}`);
  return { migrations: migrations.slice(0, at), bounded: true };
}

function readCurrentMigrationSources() {
  return fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      tag: path.basename(entry.name, '.sql'),
      source: fs.readFileSync(path.join(migrationsFolder, entry.name), 'utf8'),
    }));
}

export function assertNoTransactionForbiddenConcurrentIndexes(migrationSources) {
  for (const migration of migrationSources) {
    if (TRANSACTION_FORBIDDEN_CONCURRENT_INDEX.test(migration.source)) {
      throw new Error(`transaction_forbidden_concurrent_index migration=${migration.tag}`);
    }
  }
}

function extractLabeledSqlstate(raw) {
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const match = line.match(
      /^\s*["']?(?:sqlstate|code)["']?\s*[:=]\s*["']?([0-9A-Z]{5})["']?\s*,?\s*$/i,
    );
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function hasExactRoleMembershipError(raw) {
  return /(?:^|\n)(?:PostgresError|error):\s*must be member of role(?:\s+"?[a-z_][a-z0-9_]*"?)?\s*(?:\n|$)/im.test(
    String(raw ?? ''),
  );
}

export function classifyMigrationFailureOutput(raw) {
  const sqlstate = extractLabeledSqlstate(raw);
  let reason = 'migration_failed';
  if (sqlstate === '42501') {
    reason = hasExactRoleMembershipError(raw) ? 'role_membership_required' : 'permission_denied';
  } else if (sqlstate === '28000' || sqlstate === '28P01') {
    reason = 'permission_denied';
  } else if (sqlstate && OBJECT_CONFLICT_SQLSTATES.has(sqlstate)) {
    reason = 'object_conflict';
  } else if (sqlstate && SCHEMA_MISMATCH_SQLSTATES.has(sqlstate)) {
    reason = 'schema_mismatch';
  }
  return { reason, sqlstate };
}

function errorChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

export function classifyStructuredMigrationFailure(error) {
  const chain = errorChain(error);
  const sqlstate =
    chain
      .map((item) => item.code)
      .find((code) => typeof code === 'string' && /^[0-9A-Z]{5}$/i.test(code))
      ?.toUpperCase() ?? null;
  const membership = chain.some(
    (item) =>
      typeof item.message === 'string' &&
      /^must be member of role(?:\s+"?[a-z_][a-z0-9_]*"?)?$/i.test(item.message),
  );
  return classifyMigrationFailureOutput(
    `${membership ? 'PostgresError: must be member of role\n' : ''}${sqlstate ? `code: ${sqlstate}` : ''}`,
  );
}

function queryFromError(error) {
  return (
    errorChain(error)
      .map((item) => item.query)
      .find((query) => typeof query === 'string') ?? null
  );
}

export function renderStructuredMigrationFailureDiagnostic(error, identity) {
  const diagnostic = classifyStructuredMigrationFailure(error);
  return `[migrate] failure migration=${identity?.tag ?? 'unknown'} idx=${identity?.idx ?? 'unknown'} reason=${diagnostic.reason} sqlstate=${diagnostic.sqlstate ?? 'unknown'}`;
}

if (process.argv.includes('--self-test')) {
  const sample = [
    'PostgresError: must be member of role app_owner',
    'code: 42501',
    "Error: Failed query: INSERT INTO private_table VALUES ('TOP_SECRET')",
    'params: +79991234567 user@example.test',
  ].join('\n');
  const renderedLegacy = classifyMigrationFailureOutput(sample);
  if (renderedLegacy.reason !== 'role_membership_required' || renderedLegacy.sqlstate !== '42501') {
    throw new Error('migration diagnostic self-test lost the allowlisted category or SQLSTATE');
  }

  const structuredError = Object.assign(new Error('Failed query: TOP_SECRET'), {
    query: "SELECT 'TOP_SECRET'",
    cause: Object.assign(new Error('function private.secret() does not exist'), { code: '42883' }),
  });
  const rendered = renderStructuredMigrationFailureDiagnostic(structuredError, {
    idx: 198,
    tag: '0198_patient_visible_catalog_reads',
  });
  if (
    rendered !==
    '[migrate] failure migration=0198_patient_visible_catalog_reads idx=198 reason=schema_mismatch sqlstate=42883'
  ) {
    throw new Error(
      'structured migration diagnostic self-test lost migration identity or SQLSTATE',
    );
  }
  if (!renderStructuredMigrationFailureDiagnostic(structuredError, null).includes('migration=unknown idx=unknown')) {
    throw new Error('structured migration diagnostic self-test invented an identity it did not have');
  }
  for (const forbidden of [
    'TOP_SECRET',
    'SELECT',
    'private.secret',
    'app_owner',
    '+79991234567',
    'user@example.test',
  ]) {
    if (rendered.includes(forbidden))
      throw new Error(`migration diagnostic self-test leaked ${forbidden}`);
  }
  if (classifyMigrationFailureOutput('unlabeled 42501').sqlstate !== null) {
    throw new Error('migration diagnostic self-test accepted an unlabeled SQLSTATE');
  }
  const ledgerFixture = [
    { tag: '0001_old' },
    { tag: '0002_forward' },
    { tag: '0003_new' },
  ];
  // Applied is the ledger naming it, never "above the highest applied timestamp": a migration whose
  // name sits below everything applied is ordinary pending work.
  const pendingBelow = selectPendingMigrations(ledgerFixture, [{ tag: '0003_new' }, { tag: '0001_old' }]);
  if (pendingBelow.map((migration) => migration.tag).join(',') !== '0002_forward') {
    throw new Error('migration selection self-test lost a migration named below the applied ones');
  }
  if (selectPendingMigrations(ledgerFixture, ledgerFixture).length !== 0) {
    throw new Error('migration selection self-test would re-apply an applied migration');
  }
  try {
    assertNoTransactionForbiddenConcurrentIndexes([
      { tag: '9999_bad', source: 'CREATE INDEX CONCURRENTLY bad_index ON public.example (id);' },
    ]);
    throw new Error('migration online-index self-test accepted a transaction-forbidden statement');
  } catch (error) {
    if (error instanceof Error && error.message.includes('self-test accepted')) throw error;
  }
  assertNoTransactionForbiddenConcurrentIndexes([
    { tag: '9999_good', source: 'CREATE INDEX IF NOT EXISTS good_index ON public.example (id);' },
  ]);
  const phaseFixture = [{ tag: '0001_first' }, { tag: '0002_bound' }, { tag: '0003_later' }];
  const selectedPhase = selectMigrationPhase(phaseFixture, '0002_bound');
  if (!selectedPhase.bounded || selectedPhase.migrations.map((migration) => migration.tag).join(',') !== '0001_first') {
    throw new Error('migration phase self-test lost exclusive before-tag semantics');
  }
  for (const invalidBound of ['bad', '9999_unknown']) {
    try {
      selectMigrationPhase(phaseFixture, invalidBound);
      throw new Error('migration phase self-test accepted an invalid bound');
    } catch (error) {
      if (error instanceof Error && error.message.includes('self-test accepted')) throw error;
    }
  }
  console.log('run-webapp-drizzle-migrate diagnostic self-test: OK');
  process.exit(0);
}

if (process.argv.includes('--check-online-index-layout')) {
  assertNoTransactionForbiddenConcurrentIndexes(readCurrentMigrationSources());
  console.log('run-webapp-drizzle-migrate transaction-safe migration layout check: OK');
  process.exit(0);
}

config({ path: path.join(webappRoot, '.env.dev') });
config({ path: path.join(webappRoot, '.env') });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('[migrate] DATABASE_URL is not set (export it or use apps/webapp/.env.dev / .env)');
  process.exit(1);
}

assertNoTransactionForbiddenConcurrentIndexes(readCurrentMigrationSources());

const beforeTag = process.env.WEBAPP_MIGRATIONS_BEFORE_TAG?.trim() || undefined;
const phase = selectMigrationPhase(readMigrationFolder(migrationsFolder), beforeTag);
const pool = new pg.Pool({ connectionString: url, max: 1 });
let exitCode = 0;
let running = null;
try {
  await pool.query(renderLedgerBootstrapSql(readLegacyJournalEntries(migrationsFolder)));
  const ledgerRows = (await pool.query('SELECT tag FROM drizzle.__drizzle_migrations')).rows;
  const pending = selectPendingMigrations(phase.migrations, ledgerRows);
  const pendingTags = new Set(pending.map((migration) => migration.tag));
  const applied = phase.migrations.filter((migration) => !pendingTags.has(migration.tag));

  // A ledger row is a claim. Before adding to it, make it answer for the schema it describes.
  const expected = collectExpectedObjects(applied);
  const presenceSql = renderObjectPresenceSql(expected);
  if (presenceSql) {
    const present = (await pool.query(presenceSql)).rows;
    const missing = expected.filter((_, index) => present[index]?.present === false);
    if (missing.length > 0) {
      throw new Error(
        `migration_ledger_answers_for_absent_objects ${missing.map(describeObject).join('; ')}`,
      );
    }
  }

  for (const [index, migration] of pending.entries()) {
    running = { idx: index, tag: migration.tag };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of splitStatements(migration.source)) await client.query(statement);
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
         VALUES ($1, (SELECT COALESCE(MAX(created_at), 0) + 1000 FROM drizzle.__drizzle_migrations), $2)`,
        [migration.hash, migration.tag],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  running = null;
  console.log(
    `[migrate] Drizzle migrations complete total=${phase.migrations.length} applied-now=${pending.length}`
      + ` verified-objects=${expected.length}${phase.bounded ? ` bounded-before=${beforeTag}` : ''}`,
  );
} catch (error) {
  exitCode = 1;
  if (error instanceof Error && error.message.startsWith('migration_ledger_answers_for_absent_objects ')) {
    console.error(`[migrate] ${error.message}`);
  } else {
    console.error(renderStructuredMigrationFailureDiagnostic(error, running));
  }
  console.error('[migrate] Drizzle migration failed; raw SQL and parameters suppressed');
} finally {
  await pool.end();
}
process.exit(exitCode);
