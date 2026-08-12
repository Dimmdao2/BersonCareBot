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
const repositoryRoot = path.join(webappRoot, '..', '..');
const D30_ONLINE_INDEX_ARTIFACT = path.join(
  repositoryRoot,
  'deploy',
  'postgres',
  'd30-outgoing-delivery-queue-organization-status-due-online-index.sql',
);
const D30_ONLINE_INDEX_VARIABLE = 'D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX';
const TRANSACTION_FORBIDDEN_CONCURRENT_INDEX = /\b(?:CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+CONCURRENTLY\b/iu;
const EMPTY_BOOTSTRAP_MODE = 'empty-bootstrap';
const EMPTY_BOOTSTRAP_DATA_MIGRATIONS = new Set([
  '0143_seed_staff_organization_members',
  '0204_promote_legacy_solo_owner_membership',
]);
const EMPTY_BOOTSTRAP_PLATFORM_AUDIT_GRANT_MIGRATION =
  '0241_platform_operations_audit_health_archive_global_view';
const EMPTY_BOOTSTRAP_APP_OWNER_PUBLIC_USAGE_MIGRATION =
  '0261_platform_registration_events_read';

const OBJECT_CONFLICT_SQLSTATES = new Set(['23505', '42701', '42710', '42P06', '42P07']);
const SCHEMA_MISMATCH_SQLSTATES = new Set(['3F000', '42703', '42883', '42P01']);
const RECONCILIATION_MARKER = /^-- RECONCILES-MIGRATION-HASH: ([0-9]{4}_[a-z0-9_]+)$/gm;

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

export function validateD30OnlineIndexArtifact(source) {
  const requiredPatterns = [
    [/^\\set ON_ERROR_STOP on\s*$/mu, 'psql_on_error_stop'],
    [/idx_outgoing_delivery_queue_organization_status_due/, 'exact_index_name'],
    [/table_class\.relname = 'outgoing_delivery_queue'/, 'exact_table'],
    [/index_state\.indisvalid = false OR index_state\.indisready = false/, 'invalid_residue_query'],
    [/\\if :d30_invalid_queue_organization_status_due_index\s+DROP INDEX CONCURRENTLY IF EXISTS public\.idx_outgoing_delivery_queue_organization_status_due;\s+\\endif/m, 'conditional_invalid_residue_drop'],
    [/CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outgoing_delivery_queue_organization_status_due\s+ON public\.outgoing_delivery_queue \(organization_id, status, next_retry_at\)/m, 'concurrent_exact_index_create'],
    [/index_method\.amname = 'btree'/, 'btree_assertion'],
    [/index_state\.indisvalid = true/, 'valid_assertion'],
    [/index_state\.indisready = true/, 'ready_assertion'],
    [/index_state\.indisunique = false/, 'non_unique_assertion'],
    [/index_state\.indnkeyatts = 3/, 'three_key_columns_assertion'],
    [/index_state\.indnatts = 3/, 'no_included_columns_assertion'],
    [/index_state\.indexprs IS NULL/, 'expression_free_assertion'],
    [/index_state\.indpred IS NULL/, 'non_partial_assertion'],
    [/ARRAY\['organization_id', 'status', 'next_retry_at'\]::text\[\]/, 'ordered_key_columns_assertion'],
    [/SELECT 1 \/ 0;[^\n]*ON_ERROR_STOP/m, 'fail_closed_psql_error'],
  ];
  const missing = requiredPatterns
    .filter(([pattern]) => !pattern.test(source))
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`d30_online_index_artifact_invalid missing=${missing.join(',')}`);
  }
}

export function assertD30OnlineIndexAfterMigration(wrapper) {
  const migrationAt = wrapper.source.indexOf(wrapper.migrationCommand);
  if (migrationAt === -1) {
    throw new Error(`d30_online_index_wrapper_migration_missing wrapper=${wrapper.name}`);
  }
  const referenceAt = wrapper.source.indexOf(D30_ONLINE_INDEX_VARIABLE, migrationAt);
  if (referenceAt === -1) {
    throw new Error(`d30_online_index_wrapper_reference_missing wrapper=${wrapper.name}`);
  }
  const applyWindow = wrapper.source.slice(referenceAt - 320, referenceAt + 320);
  if (!/psql[\s\S]*-f[\s\S]*D30_OUTGOING_DELIVERY_QUEUE_ORGANIZATION_STATUS_DUE_ONLINE_INDEX/.test(applyWindow)) {
    throw new Error(`d30_online_index_wrapper_apply_missing wrapper=${wrapper.name}`);
  }
}

export function validateD30OnlineIndexDeployment({ migrationSources, artifactSource, wrappers }) {
  assertNoTransactionForbiddenConcurrentIndexes(migrationSources);
  validateD30OnlineIndexArtifact(artifactSource);
  for (const wrapper of wrappers) assertD30OnlineIndexAfterMigration(wrapper);
}

function validateCurrentD30OnlineIndexDeployment() {
  const wrappers = [
    {
      name: 'migrate-dev',
      path: path.join(repositoryRoot, 'deploy', 'host', 'migrate-dev.sh'),
      migrationCommand: '  pnpm run migrate',
    },
    {
      name: 'deploy-test',
      path: path.join(repositoryRoot, 'deploy', 'host', 'deploy-test.sh'),
      migrationCommand: 'pnpm --dir apps/webapp run migrate',
    },
    {
      name: 'deploy-test-saas',
      path: path.join(repositoryRoot, 'deploy', 'host', 'deploy-test-saas.sh'),
      migrationCommand: "WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate",
    },
    {
      name: 'deploy-prod',
      path: path.join(repositoryRoot, 'deploy', 'host', 'deploy-prod.sh'),
      migrationCommand: 'pnpm --dir apps/webapp run migrate',
    },
  ].map((wrapper) => ({ ...wrapper, source: fs.readFileSync(wrapper.path, 'utf8') }));
  const migrationSources = readCurrentMigrationSources();
  // Reject this class before requiring its companion artifact: this preserves a useful red-first
  // diagnostic while a migration still contains a transaction-forbidden statement.
  assertNoTransactionForbiddenConcurrentIndexes(migrationSources);
  validateD30OnlineIndexArtifact(fs.readFileSync(D30_ONLINE_INDEX_ARTIFACT, 'utf8'));
  for (const wrapper of wrappers) assertD30OnlineIndexAfterMigration(wrapper);
}

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

  const appliedByTag = new Map();
  const isApplied = (entry) => {
    const cached = appliedByTag.get(entry.tag);
    if (cached !== undefined) return cached;

    const migration = migrationByWhen.get(entry.when);
    if (!migration) throw new Error(`migration_journal_file_missing tag=${entry.tag}`);
    if (ledgerHashes.has(migration.hash)) {
      appliedByTag.set(entry.tag, true);
      return true;
    }

    const forward = forwardBySource.get(entry.tag);
    const applied = forward ? isApplied(forward) : false;
    appliedByTag.set(entry.tag, applied);
    return applied;
  };

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
    if (isApplied(entry)) {
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

async function migrateEmptyBootstrap(pool, migrations, journalEntries) {
  const client = await pool.connect();
  try {
    const identity = await client.query(
      'SELECT current_user AS migration_role, session_user AS administrative_role',
    );
    const migrationRole = String(identity.rows[0]?.migration_role ?? '');
    const administrativeRole = String(identity.rows[0]?.administrative_role ?? '');
    if (!migrationRole || !administrativeRole || migrationRole === administrativeRole) {
      throw new Error('empty_bootstrap_requires_distinct_administrative_session_and_migration_role');
    }
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    const state = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM drizzle.__drizzle_migrations) AS ledger_count,
        (SELECT count(*)::integer FROM public.platform_users) AS platform_user_count,
        (SELECT count(*)::integer FROM public.appointment_records) AS appointment_count
    `);
    const row = state.rows[0];
    if (
      row?.ledger_count !== 0 ||
      row?.platform_user_count !== 0 ||
      row?.appointment_count !== 0
    ) {
      throw new Error('empty_bootstrap_requires_empty_test_data_and_drizzle_ledger');
    }

    const journalByWhen = new Map(journalEntries.map((entry) => [entry.when, entry]));
    await client.query('BEGIN');
    try {
      for (const migration of migrations) {
        const journal = journalByWhen.get(migration.folderMillis);
        if (!journal) throw new Error(`migration_journal_entry_missing when=${migration.folderMillis}`);
        if (journal.tag === EMPTY_BOOTSTRAP_PLATFORM_AUDIT_GRANT_MIGRATION) {
          // Historical 0241 asserts app_staff grants that came from the pre-migration host
          // provisioning overlay. Recreate only that prerequisite inside this disposable empty
          // bootstrap transaction; the subsequent owner-ordered zero removes every legacy grant.
          await client.query(
            'GRANT SELECT ON public.admin_audit_log, public.operator_health_failure_archive TO app_staff',
          );
        }
        if (journal.tag === EMPTY_BOOTSTRAP_APP_OWNER_PUBLIC_USAGE_MIGRATION) {
          // Historical app_owner schema usage came from host provisioning before this migration.
          // Its SQL function body references public.* while SET ROLE app_owner is active, so restore
          // only schema name resolution as the administrative session, then return to the exact
          // migration role. `RESET ROLE` cannot be used here: a startup `PGOPTIONS role=...`
          // makes RESET return to that configured migration role rather than to session_user.
          // The grant remains inside the disposable bootstrap transaction.
          await client.query(`SET ROLE ${pg.escapeIdentifier(administrativeRole)}`);
          try {
            await client.query('GRANT USAGE ON SCHEMA public TO app_owner');
          } finally {
            await client.query(`SET ROLE ${pg.escapeIdentifier(migrationRole)}`);
          }
          const usage = await client.query(
            "SELECT has_schema_privilege('app_owner', 'public', 'USAGE') AS enabled",
          );
          if (usage.rows[0]?.enabled !== true) {
            throw new Error('empty_bootstrap_app_owner_public_usage_not_granted');
          }
        }
        if (EMPTY_BOOTSTRAP_DATA_MIGRATIONS.has(journal.tag)) {
          console.log(`[migrate] empty-bootstrap skipped data-only migration=${journal.tag}`);
        } else {
          try {
            for (const statement of migration.sql) await client.query(statement);
          } catch (error) {
            console.error(
              `[migrate] empty-bootstrap failed migration=${journal.tag} idx=${journal.idx}`,
            );
            throw error;
          }
        }
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [migration.hash, migration.folderMillis],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
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
  const chained = inspectMigrationLedgerCompleteness({
    ...ledgerFixture,
    ledgerHashes: new Set(['new-current']),
    reconciliations: [
      { sourceTag: '0001_old', forwardTag: '0002_forward' },
      { sourceTag: '0002_forward', forwardTag: '0003_new' },
    ],
  });
  if (chained.missing.length !== 0 || chained.direct !== 1 || chained.reconciled !== 2) {
    throw new Error('migration ledger self-test rejected a transitive forward reconciliation');
  }
  for (const invalidReconciliations of [
    [{ sourceTag: '9999_unknown', forwardTag: '0002_forward' }],
    [{ sourceTag: '0002_forward', forwardTag: '0001_old' }],
    [
      { sourceTag: '0001_old', forwardTag: '0002_forward' },
      { sourceTag: '0001_old', forwardTag: '0003_new' },
    ],
  ]) {
    try {
      inspectMigrationLedgerCompleteness({
        ...ledgerFixture,
        ledgerHashes: new Set(['forward-current', 'new-current']),
        reconciliations: invalidReconciliations,
      });
      throw new Error('migration ledger self-test accepted an invalid reconciliation marker');
    } catch (error) {
      if (error instanceof Error && error.message.includes('self-test accepted')) throw error;
    }
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
  try {
    validateD30OnlineIndexArtifact('CREATE INDEX CONCURRENTLY IF NOT EXISTS wrong ON public.example (id);');
    throw new Error('migration online-index self-test accepted an incomplete artifact');
  } catch (error) {
    if (error instanceof Error && error.message.includes('self-test accepted')) throw error;
  }
  const wrapperFixture = {
    name: 'fixture',
    migrationCommand: 'pnpm migrate',
    source:
      'pnpm migrate\npsql -X -v ON_ERROR_STOP=1 -f "$REPO/' +
      D30_ONLINE_INDEX_VARIABLE +
      '"',
  };
  assertD30OnlineIndexAfterMigration(wrapperFixture);
  try {
    assertD30OnlineIndexAfterMigration({
      ...wrapperFixture,
      source:
        'psql -X -v ON_ERROR_STOP=1 -f "$REPO/' +
        D30_ONLINE_INDEX_VARIABLE +
        '"\npnpm migrate',
    });
    throw new Error('migration online-index self-test accepted a pre-migration artifact apply');
  } catch (error) {
    if (error instanceof Error && error.message.includes('self-test accepted')) throw error;
  }
  validateCurrentD30OnlineIndexDeployment();
  console.log('run-webapp-drizzle-migrate diagnostic self-test: OK');
  process.exit(0);
}

if (process.argv.includes('--check-online-index-layout')) {
  validateCurrentD30OnlineIndexDeployment();
  console.log('run-webapp-drizzle-migrate online-index layout check: OK');
  process.exit(0);
}

config({ path: path.join(webappRoot, '.env.dev') });
config({ path: path.join(webappRoot, '.env') });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('[migrate] DATABASE_URL is not set (export it or use apps/webapp/.env.dev / .env)');
  process.exit(1);
}

validateCurrentD30OnlineIndexDeployment();

const migrations = readMigrationFiles({ migrationsFolder });
const journalEntries = JSON.parse(fs.readFileSync(journalPath, 'utf8')).entries;
const reconciliations = readMigrationReconciliations(migrationsFolder, journalEntries);
const pool = new pg.Pool({ connectionString: url, max: 1 });
let exitCode = 0;
try {
  if (process.env.WEBAPP_DRIZZLE_MIGRATIONS_MODE?.trim() === EMPTY_BOOTSTRAP_MODE) {
    await migrateEmptyBootstrap(pool, migrations, journalEntries);
  } else {
    await migrate(drizzle(pool), { migrationsFolder });
  }
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
  if (error instanceof Error && error.message.startsWith('migration_ledger_incomplete ')) {
    console.error(`[migrate] ${error.message}`);
  } else {
    console.error(renderStructuredMigrationFailureDiagnostic(error, migrations, journalEntries));
  }
  console.error('[migrate] Drizzle migration failed; raw SQL and parameters suppressed');
} finally {
  await pool.end();
}
process.exit(exitCode);
