#!/usr/bin/env node
/**
 * Canonical webapp DB migration entrypoint (used by `pnpm run migrate`).
 * Runs the Drizzle ORM migrator directly so PostgreSQL failures retain their structured
 * SQLSTATE/cause. Diagnostics expose only the migration tag, index and allowlisted category;
 * SQL, parameters, connection strings and database data are never rendered.
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.join(__dirname, '..');
const migrationsFolder = path.join(webappRoot, 'db', 'drizzle-migrations');
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

const OBJECT_CONFLICT_SQLSTATES = new Set(['23505', '42701', '42710', '42P06', '42P07']);
const SCHEMA_MISMATCH_SQLSTATES = new Set(['3F000', '42703', '42883', '42P01']);
const RECONCILIATION_MARKER = /^-- RECONCILES-MIGRATION-HASH: ([0-9]{4}_[a-z0-9_]+)$/gm;

export function readMigrationReconciliations(folder, entries) {
  const entryByTag = new Map(entries.map((entry) => [entry.tag, entry]));
  const reconciliations = [];
  for (const forward of entries) {
    const sqlPath = path.join(folder, `${forward.tag}.sql`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    for (const match of sql.matchAll(RECONCILIATION_MARKER)) {
      const sourceTag = match[1];
      const source = entryByTag.get(sourceTag);
      if (!source) {
        throw new Error(`migration_reconciliation_unknown_source source=${sourceTag} forward=${forward.tag}`);
      }
      if (source.when >= forward.when) {
        throw new Error(`migration_reconciliation_not_forward source=${sourceTag} forward=${forward.tag}`);
      }
      reconciliations.push({ sourceTag, forwardTag: forward.tag });
    }
  }
  return reconciliations;
}

export function inspectMigrationLedgerCompleteness({ migrations, journalEntries, ledgerHashes, reconciliations }) {
  const migrationByWhen = new Map(migrations.map((migration) => [migration.folderMillis, migration]));
  const entryByTag = new Map(journalEntries.map((entry) => [entry.tag, entry]));
  const forwardBySource = new Map();

  for (const reconciliation of reconciliations) {
    const source = entryByTag.get(reconciliation.sourceTag);
    const forward = entryByTag.get(reconciliation.forwardTag);
    if (!source || !forward || source.when >= forward.when) {
      throw new Error(
        `migration_reconciliation_invalid source=${reconciliation.sourceTag} forward=${reconciliation.forwardTag}`,
      );
    }
    if (forwardBySource.has(source.tag)) {
      throw new Error(`migration_reconciliation_ambiguous source=${source.tag}`);
    }
    forwardBySource.set(source.tag, forward);
  }

  const missing = [];
  let direct = 0;
  let reconciled = 0;
  for (const entry of journalEntries) {
    const migration = migrationByWhen.get(entry.when);
    if (!migration) throw new Error(`migration_journal_file_missing tag=${entry.tag}`);
    if (ledgerHashes.has(migration.hash)) {
      direct += 1;
      continue;
    }
    const forward = forwardBySource.get(entry.tag);
    const forwardMigration = forward ? migrationByWhen.get(forward.when) : null;
    if (forwardMigration && ledgerHashes.has(forwardMigration.hash)) {
      reconciled += 1;
      continue;
    }
    missing.push(entry.tag);
  }
  return { direct, reconciled, missing };
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

function normalizeStatement(value) {
  return String(value ?? '')
    .trim()
    .replace(/;\s*$/, '')
    .trim();
}

export function findMigrationIdentity(query, migrations, journalEntries) {
  const normalizedQuery = normalizeStatement(query);
  if (!normalizedQuery) return null;
  const matches = migrations.filter((migration) =>
    migration.sql.some((statement) => normalizeStatement(statement) === normalizedQuery),
  );
  // Repeated DDL exists in the historical chain. Never claim a migration identity when the
  // failing statement is not unique; a safe `unknown` is better than a misleading tag.
  if (matches.length !== 1) return null;
  const migration = matches[0];
  const journal = journalEntries.find((entry) => entry.when === migration.folderMillis);
  if (!journal || !/^[0-9]{4}_[a-z0-9_]+$/.test(journal.tag) || !Number.isInteger(journal.idx)) {
    return null;
  }
  return { idx: journal.idx, tag: journal.tag };
}

function queryFromError(error) {
  return (
    errorChain(error)
      .map((item) => item.query)
      .find((query) => typeof query === 'string') ?? null
  );
}

export function renderStructuredMigrationFailureDiagnostic(error, migrations, journalEntries) {
  const diagnostic = classifyStructuredMigrationFailure(error);
  const identity = findMigrationIdentity(queryFromError(error), migrations, journalEntries);
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
  const rendered = renderStructuredMigrationFailureDiagnostic(
    structuredError,
    [{ folderMillis: 123, sql: ["SELECT 'TOP_SECRET';"] }],
    [{ idx: 198, when: 123, tag: '0198_patient_visible_catalog_reads' }],
  );
  if (
    rendered !==
    '[migrate] failure migration=0198_patient_visible_catalog_reads idx=198 reason=schema_mismatch sqlstate=42883'
  ) {
    throw new Error(
      'structured migration diagnostic self-test lost migration identity or SQLSTATE',
    );
  }
  const ambiguous = renderStructuredMigrationFailureDiagnostic(
    structuredError,
    [
      { folderMillis: 123, sql: ["SELECT 'TOP_SECRET';"] },
      { folderMillis: 124, sql: ["SELECT 'TOP_SECRET';"] },
    ],
    [
      { idx: 198, when: 123, tag: '0198_patient_visible_catalog_reads' },
      { idx: 199, when: 124, tag: '0199_current_patient_booking_rows' },
    ],
  );
  if (!ambiguous.includes('migration=unknown idx=unknown')) {
    throw new Error('structured migration diagnostic self-test misattributed duplicate SQL');
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
  const ledgerFixture = {
    migrations: [
      { folderMillis: 100, hash: 'old-current' },
      { folderMillis: 200, hash: 'forward-current' },
      { folderMillis: 300, hash: 'new-current' },
    ],
    journalEntries: [
      { idx: 0, when: 100, tag: '0001_old' },
      { idx: 1, when: 200, tag: '0002_forward' },
      { idx: 2, when: 300, tag: '0003_new' },
    ],
    reconciliations: [{ sourceTag: '0001_old', forwardTag: '0002_forward' }],
  };
  const incomplete = inspectMigrationLedgerCompleteness({
    ...ledgerFixture,
    ledgerHashes: new Set(['forward-current']),
  });
  if (incomplete.missing.join(',') !== '0003_new' || incomplete.reconciled !== 1) {
    throw new Error('migration ledger self-test did not distinguish reconciled and missing hashes');
  }
  const complete = inspectMigrationLedgerCompleteness({
    ...ledgerFixture,
    ledgerHashes: new Set(['forward-current', 'new-current']),
  });
  if (complete.missing.length !== 0 || complete.direct !== 2 || complete.reconciled !== 1) {
    throw new Error('migration ledger self-test rejected an applied forward reconciliation');
  }
  const unappliedForward = inspectMigrationLedgerCompleteness({
    ...ledgerFixture,
    ledgerHashes: new Set(['new-current']),
  });
  if (unappliedForward.missing.join(',') !== '0001_old,0002_forward') {
    throw new Error('migration ledger self-test accepted an unapplied forward reconciliation');
  }
  console.log('run-webapp-drizzle-migrate diagnostic self-test: OK');
  process.exit(0);
}

config({ path: path.join(webappRoot, '.env.dev') });
config({ path: path.join(webappRoot, '.env') });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('[migrate] DATABASE_URL is not set (export it or use apps/webapp/.env.dev / .env)');
  process.exit(1);
}

const migrations = readMigrationFiles({ migrationsFolder });
const journalEntries = JSON.parse(fs.readFileSync(journalPath, 'utf8')).entries;
const reconciliations = readMigrationReconciliations(migrationsFolder, journalEntries);
const pool = new pg.Pool({ connectionString: url, max: 1 });
let exitCode = 0;
try {
  await migrate(drizzle(pool), { migrationsFolder });
  const ledgerResult = await pool.query('SELECT hash FROM drizzle.__drizzle_migrations');
  const completeness = inspectMigrationLedgerCompleteness({
    migrations,
    journalEntries,
    ledgerHashes: new Set(ledgerResult.rows.map((row) => String(row.hash))),
    reconciliations,
  });
  if (completeness.missing.length > 0) {
    throw new Error(`migration_ledger_incomplete tags=${completeness.missing.join(',')}`);
  }
  console.log(
    `[migrate] Drizzle migrations complete count=${migrations.length} direct=${completeness.direct} reconciled=${completeness.reconciled}`,
  );
} catch (error) {
  exitCode = 1;
  console.error(renderStructuredMigrationFailureDiagnostic(error, migrations, journalEntries));
  console.error('[migrate] Drizzle migration failed; raw SQL and parameters suppressed');
} finally {
  await pool.end();
}
process.exit(exitCode);
