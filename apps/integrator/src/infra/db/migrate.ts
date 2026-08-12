// Загружаем переменные окружения (например, DATABASE_URL)
import '../../config/loadEnv.js';
import { readdir, readFile, stat } from 'fs/promises'; // Работа с файловой системой
import { join } from 'path'; // Склейка путей
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { getAppRoot } from '../../config/appRoot.js';
import { env } from '../../config/env.js'; // Переменные окружения
import { logger, getMigrationLogger } from '../observability/logger.js'; // Логирование
import { createIntegratorMigrationPoolProvider } from './integratorMigrationPoolProvider.js';

/** Учёт SQL-миграций integrator; всегда с квалификатором схемы — не совпадает с `public.schema_migrations` webapp (`filename`). */
const INTEGRATOR_MIGRATIONS_TABLE = 'integrator.schema_migrations';
const EMPTY_BOOTSTRAP_MODE = 'empty-bootstrap';
const EMPTY_BOOTSTRAP_SUPERSEDED_MIGRATIONS = new Set([
  'core:20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
  'core:20260708_0004_p0_4_i4_integrator_mailings_org.sql',
  'core:20260710_0001_r2_integrator_scoped_org_not_null.sql',
]);

// Описывает одну миграцию: область (scope), имя файла, путь и версию
export type MigrationFile = {
  scope: string;
  fileName: string;
  filePath: string;
  version: string;
};

type DbQueryResult<T extends object = Record<string, unknown>> = {
  rows: T[];
};

export type MigrationDbClient = {
  query<T extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<DbQueryResult<T>>;
  end(): Promise<void>;
};

type MigrationLedgerShape = {
  readColumn: 'version' | 'filename';
  writeColumn: 'version' | 'filename';
};

export type StartupMigrationMode = 'run-ddl-migrations' | 'verify-ledger-only';

export function resolveStartupMigrationMode(
  dbPrincipalContextMode: string | undefined,
): StartupMigrationMode {
  const normalized = dbPrincipalContextMode?.trim();
  if (normalized === 'locked' || normalized === 'shadow' || normalized === 'port-context')
    return 'verify-ledger-only';
  return 'run-ddl-migrations';
}

function isUndefinedColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42703') return true;
  const m = String(e?.message ?? '').toLowerCase();
  return (
    m.includes('does not exist') || m.includes('не существует') // PostgreSQL localized messages on some installs
  );
}

function isMissingVersionColumnProbeError(err: unknown): boolean {
  if (!isUndefinedColumnError(err)) return false;
  const m = String((err as { message?: string }).message ?? '').toLowerCase();
  return m.includes('version');
}

function isMissingFilenameColumnProbeError(err: unknown): boolean {
  if (!isUndefinedColumnError(err)) return false;
  const m = String((err as { message?: string }).message ?? '').toLowerCase();
  return m.includes('filename');
}

// Создаёт схему integrator и таблицу учёта миграций, если их нет
async function ensureMigrationsTable(db: MigrationDbClient): Promise<void> {
  await db.query('CREATE SCHEMA IF NOT EXISTS integrator');
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${INTEGRATOR_MIGRATIONS_TABLE} (
      version text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);
}

async function verifyMigrationLedgerExists(db: MigrationDbClient): Promise<void> {
  const res = await db.query<{ ledger_regclass: string | null }>(
    'SELECT to_regclass($1) AS ledger_regclass',
    [INTEGRATOR_MIGRATIONS_TABLE],
  );
  if (!res.rows[0]?.ledger_regclass) {
    throw new Error(
      `${INTEGRATOR_MIGRATIONS_TABLE} is missing; run integrator migrations before starting shadow/locked runtime`,
    );
  }
}

async function resolveMigrationLedgerShape(db: MigrationDbClient): Promise<MigrationLedgerShape> {
  // Prefer probing real column resolution (same as migrations use at runtime).
  // information_schema can be misleading for some roles/views; SELECT ... LIMIT 0 fails fast on missing columns.
  try {
    await db.query(`SELECT version FROM ${INTEGRATOR_MIGRATIONS_TABLE} LIMIT 0`);
    return { readColumn: 'version', writeColumn: 'version' };
  } catch (firstErr: unknown) {
    if (!isMissingVersionColumnProbeError(firstErr)) throw firstErr;

    try {
      await db.query(`SELECT filename FROM ${INTEGRATOR_MIGRATIONS_TABLE} LIMIT 0`);
      return { readColumn: 'filename', writeColumn: 'filename' };
    } catch {
      const msg = String((firstErr as { message?: string }).message ?? '');
      throw new Error(
        `${INTEGRATOR_MIGRATIONS_TABLE} must have column "version" (current integrator ledger) or legacy "filename". First error: ${msg}`,
      );
    }
  }
}

function normalizeAppliedVersion(rawValue: string, migrations: MigrationFile[]): string[] {
  if (rawValue.includes(':')) return [rawValue];

  const matching = migrations.filter((migration) => migration.fileName === rawValue);
  if (matching.length === 1) {
    const onlyMatch = matching[0];
    if (onlyMatch) return [onlyMatch.version];
  }

  // Фоллбек для старого формата ledgеr: считаем core:<filename>, если в текущем наборе есть такая миграция.
  const legacyCoreVersion = `core:${rawValue}`;
  if (migrations.some((migration) => migration.version === legacyCoreVersion)) {
    return [legacyCoreVersion];
  }

  return [rawValue];
}

// Получает список уже применённых миграций из integrator.schema_migrations
async function getAppliedVersions(
  db: MigrationDbClient,
  ledgerShape: MigrationLedgerShape,
  migrations: MigrationFile[],
): Promise<Set<string>> {
  const readIntoSet = async (shape: MigrationLedgerShape): Promise<Set<string>> => {
    const res = await db.query<{ value: string }>(
      `SELECT ${shape.readColumn} AS value FROM ${INTEGRATOR_MIGRATIONS_TABLE}`,
    );
    const applied = new Set<string>();
    for (const row of res.rows) {
      const value = row.value;
      if (typeof value !== 'string' || value.length === 0) continue;
      for (const normalized of normalizeAppliedVersion(value, migrations)) {
        applied.add(normalized);
      }
    }
    return applied;
  };

  try {
    return await readIntoSet(ledgerShape);
  } catch (err: unknown) {
    if (
      ledgerShape.readColumn === 'version' &&
      isMissingVersionColumnProbeError(err) &&
      !isMissingFilenameColumnProbeError(err)
    ) {
      logger.warn(
        { err },
        'integrator migration ledger: expected version column but query failed; retrying with filename column',
      );
      return await readIntoSet({ readColumn: 'filename', writeColumn: 'filename' });
    }
    throw err;
  }
}

// Проверяет, является ли файл миграцией (sql и не example)
function isSqlMigrationFile(fileName: string): boolean {
  if (!fileName.endsWith('.sql')) return false;
  if (fileName.toLowerCase().includes('example')) return false;
  return true;
}

// Проверяет, существует ли директория
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const info = await stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

// Формирует объект MigrationFile для одной миграции
function toMigrationFile(scope: string, dirPath: string, fileName: string): MigrationFile {
  return {
    scope,
    fileName,
    filePath: join(dirPath, fileName),
    version: `${scope}:${fileName}`,
  };
}

// Находит все core-миграции (src/infra/db/migrations/core)
async function discoverCoreMigrations(rootDir: string): Promise<MigrationFile[]> {
  if (!(await directoryExists(rootDir))) return [];

  const files = (await readdir(rootDir)).filter((name) => isSqlMigrationFile(name)).sort();

  return files.map((name) => toMigrationFile('core', rootDir, name));
}

// Находит миграции для всех интеграций (src/integrations/*/db/migrations)
async function discoverIntegrationMigrations(integrationsRoot: string): Promise<MigrationFile[]> {
  if (!(await directoryExists(integrationsRoot))) return [];

  const entries = await readdir(integrationsRoot, { withFileTypes: true });
  const integrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const result: MigrationFile[] = [];

  for (const integrationName of integrationNames) {
    const migrationsDir = join(integrationsRoot, integrationName, 'db', 'migrations');
    if (!(await directoryExists(migrationsDir))) continue;

    const files = (await readdir(migrationsDir)).filter((name) => isSqlMigrationFile(name)).sort();

    for (const fileName of files) {
      result.push(toMigrationFile(integrationName, migrationsDir, fileName));
    }
  }

  return result;
}

// Находит все миграции (core + интеграции), порядок — по имени файла (дата+суффикс).
// Раньше шли все core, затем все интеграции; из-за этого на пустой БД core-миграции вроде
// stage13 freeze ссылались на таблицы, которые создаются только в integration migrations позже.
async function discoverMigrations(): Promise<MigrationFile[]> {
  const appRoot = getAppRoot();
  const coreDir = join(appRoot, 'src', 'infra', 'db', 'migrations', 'core');
  const integrationsRoot = join(appRoot, 'src', 'integrations');

  const core = await discoverCoreMigrations(coreDir);
  const integrations = await discoverIntegrationMigrations(integrationsRoot);

  const merged = [...core, ...integrations];
  merged.sort((a, b) => a.fileName.localeCompare(b.fileName));

  // Historical telegram 0009 was numbered before the core tables it references. Existing
  // databases already have these entries in the ledger, but a genuinely empty database must
  // create the three prerequisites before attempting telegram_state. Move only this exact
  // dependency chain; keep every other historical migration in its established filename order.
  const telegramStateVersion = 'telegram:20260306_0009_add_telegram_state_split.sql';
  const identityPrerequisiteVersions = [
    'core:20260306_0012_create_users.sql',
    'core:20260306_0013_create_identities.sql',
    'core:20260306_0014_create_contacts.sql',
  ];
  const telegramStateIndex = merged.findIndex(
    (migration) => migration.version === telegramStateVersion,
  );
  if (telegramStateIndex < 0) return merged;

  const prerequisites = identityPrerequisiteVersions
    .map((version) => merged.find((migration) => migration.version === version))
    .filter((migration): migration is MigrationFile => migration !== undefined);
  const prerequisiteSet = new Set(identityPrerequisiteVersions);
  const withoutPrerequisites = merged.filter(
    (migration) => !prerequisiteSet.has(migration.version),
  );
  const insertionIndex = withoutPrerequisites.findIndex(
    (migration) => migration.version === telegramStateVersion,
  );
  withoutPrerequisites.splice(insertionIndex, 0, ...prerequisites);
  return withoutPrerequisites;
}

/**
 * Cross-app migration-ordering fix (taskdb #667): integrator SaaS migrations (filename date
 * >= 20260708) do `... FROM public.org_enrollments` / `public.be_organization_members`, which are
 * created by WEBAPP migrations. On a fresh DB, integrator's own migrate step must therefore be
 * split into a "base" phase (runs before webapp core) and a "SaaS" phase (runs after webapp core
 * creates those public tables). `scripts/migrate-all.sh` orchestrates this with
 * INTEGRATOR_MIGRATIONS_BEFORE_DATE as an optional upper bound on the FIRST integrator phase.
 *
 * Extracts the leading 8-digit YYYYMMDD date embedded in the migration filename (all real
 * integrator migration filenames start with one, e.g. `20260708_0001_....sql`; `version` is
 * `<scope>:<fileName>`, so it also works as a fallback source). Returns null if no 8-digit date
 * can be found — such a migration is treated as "base" (always eligible) so an unparseable
 * filename never silently gets skipped.
 */
export function extractMigrationDate(migration: MigrationFile): number | null {
  const fromFileName = /^(\d{8})_/.exec(migration.fileName);
  if (fromFileName?.[1]) return Number(fromFileName[1]);

  const fromVersion = /:(\d{8})_/.exec(migration.version);
  if (fromVersion?.[1]) return Number(fromVersion[1]);

  return null;
}

type BoundedMigrations = {
  eligible: MigrationFile[];
  deferred: MigrationFile[];
};

/**
 * Splits `migrations` by the optional INTEGRATOR_MIGRATIONS_BEFORE_DATE bound (a YYYYMMDD string,
 * e.g. "20260708"). Migrations whose embedded date is >= the bound are deferred (not applied this
 * run). When `boundRaw` is unset/empty, everything is eligible and nothing is deferred — this is
 * the default path and MUST stay behaviorally identical to "no bound at all".
 */
export function applyBeforeDateBound(
  migrations: MigrationFile[],
  boundRaw: string | undefined,
): BoundedMigrations {
  if (!boundRaw) return { eligible: migrations, deferred: [] };

  const bound = Number(boundRaw);
  if (!Number.isFinite(bound) || !/^\d{8}$/.test(boundRaw)) {
    throw new Error(
      `INTEGRATOR_MIGRATIONS_BEFORE_DATE must be an 8-digit date (YYYYMMDD), got: "${boundRaw}"`,
    );
  }

  const eligible: MigrationFile[] = [];
  const deferred: MigrationFile[] = [];
  for (const migration of migrations) {
    const date = extractMigrationDate(migration);
    // No parseable date => treat as base (< bound) so it always runs rather than being silently skipped.
    if (date === null || date < bound) {
      eligible.push(migration);
    } else {
      deferred.push(migration);
    }
  }
  return { eligible, deferred };
}

// 'telegram:20260306_0004_add_notification_settings.sql' — версия миграции, не секрет

async function applyMigration(
  db: MigrationDbClient,
  migration: MigrationFile,
  sql: string,
  ledgerShape: MigrationLedgerShape,
): Promise<void> {
  const migrationLogger = getMigrationLogger(migration.version);
  const ledgerValue =
    ledgerShape.writeColumn === 'version' ? migration.version : migration.fileName;

  // Полностью идемпотентная логика для любых миграций
  await db.query('BEGIN');
  try {
    await db.query(sql); // Выполняем SQL миграции
    await db.query(
      `INSERT INTO ${INTEGRATOR_MIGRATIONS_TABLE}(${ledgerShape.writeColumn}) VALUES($1)`,
      [ledgerValue],
    ); // Отмечаем как применённую
    await db.query('COMMIT');
    migrationLogger.info(
      {
        scope: migration.scope,
        fileName: migration.fileName,
        migration: migration.version,
      },
      'Applied migration',
    );
  } catch (error: unknown) {
    // Список ошибок, которые считаются "уже применено"
    const safePgCodes = [
      '42710', // duplicate_object
      '42701', // duplicate_column
      '42P07', // duplicate_table
      '23505', // unique_violation
      '42P16', // invalid_table_definition (например, constraint exists)
    ];
    const safeMessages = [
      'already exists',
      'duplicate',
      'already defined',
      'already in',
      'already present',
      'constraint',
    ];
    const errObj = error as { code?: string; message?: string };
    const pgCode = errObj?.code;
    const msg = (errObj?.message || '').toLowerCase();
    const isSafe =
      (pgCode && safePgCodes.includes(pgCode)) || safeMessages.some((m) => msg.includes(m));
    if (isSafe) {
      await db.query('ROLLBACK');
      await db.query(
        `INSERT INTO ${INTEGRATOR_MIGRATIONS_TABLE}(${ledgerShape.writeColumn}) VALUES($1)`,
        [ledgerValue],
      );
      migrationLogger.warn(
        {
          err: error,
          scope: migration.scope,
          fileName: migration.fileName,
          migration: migration.version,
          idempotent: true,
        },
        'Migration already applied or structure exists, marking as applied',
      );
      return;
    }
    await db.query('ROLLBACK');
    migrationLogger.error(
      {
        err: error,
        scope: migration.scope,
        fileName: migration.fileName,
        migration: migration.version,
      },
      'Migration failed',
    );
    throw error;
  }
}

async function recordEmptyBootstrapSupersededMigration(
  db: MigrationDbClient,
  migration: MigrationFile,
  ledgerShape: MigrationLedgerShape,
): Promise<void> {
  const migrationLogger = getMigrationLogger(migration.version);
  const ledgerValue =
    ledgerShape.writeColumn === 'version' ? migration.version : migration.fileName;

  await db.query('BEGIN');
  try {
    // Freeze every surviving target while proving this really is the approved data-empty TEST
    // bootstrap. The four D8 mailing relations must stay absent; recreating them just to satisfy
    // historical tenant backfills would reverse their owner-approved retirement.
    await db.query(`
      LOCK TABLE
        public.platform_users,
        integrator.contacts,
        integrator.content_access_grants,
        integrator.conversations,
        integrator.message_drafts,
        integrator.user_questions,
        integrator.conversation_messages,
        integrator.question_messages,
        integrator.user_reminder_rules,
        integrator.user_reminder_occurrences,
        integrator.user_reminder_delivery_logs
      IN SHARE MODE
    `);
    const state = await db.query<{
      surviving_rows: string;
      mailing_logs: string | null;
      user_subscriptions: string | null;
      mailings: string | null;
      mailing_topics: string | null;
    }>(`
      SELECT
        (
          (SELECT count(*) FROM public.platform_users)
          + (SELECT count(*) FROM integrator.contacts)
          + (SELECT count(*) FROM integrator.content_access_grants)
          + (SELECT count(*) FROM integrator.conversations)
          + (SELECT count(*) FROM integrator.message_drafts)
          + (SELECT count(*) FROM integrator.user_questions)
          + (SELECT count(*) FROM integrator.conversation_messages)
          + (SELECT count(*) FROM integrator.question_messages)
          + (SELECT count(*) FROM integrator.user_reminder_rules)
          + (SELECT count(*) FROM integrator.user_reminder_occurrences)
          + (SELECT count(*) FROM integrator.user_reminder_delivery_logs)
        )::text AS surviving_rows,
        to_regclass('integrator.mailing_logs')::text AS mailing_logs,
        to_regclass('integrator.user_subscriptions')::text AS user_subscriptions,
        to_regclass('integrator.mailings')::text AS mailings,
        to_regclass('integrator.mailing_topics')::text AS mailing_topics
    `);
    const row = state.rows[0];
    if (
      !row ||
      row.surviving_rows !== '0' ||
      row.mailing_logs !== null ||
      row.user_subscriptions !== null ||
      row.mailings !== null ||
      row.mailing_topics !== null
    ) {
      throw new Error('integrator_empty_bootstrap_superseded_state_invalid');
    }

    await db.query(
      `INSERT INTO ${INTEGRATOR_MIGRATIONS_TABLE}(${ledgerShape.writeColumn}) VALUES($1)`,
      [ledgerValue],
    );
    await db.query('COMMIT');
    migrationLogger.info(
      {
        scope: migration.scope,
        fileName: migration.fileName,
        migration: migration.version,
      },
      'Empty bootstrap recorded superseded legacy-shaping migration',
    );
  } catch (error: unknown) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function verifyStartupMigrationState(
  db: MigrationDbClient,
  migrations: MigrationFile[],
): Promise<void> {
  await verifyMigrationLedgerExists(db);
  const ledgerShape = await resolveMigrationLedgerShape(db);
  const applied = await getAppliedVersions(db, ledgerShape, migrations);
  const missing = migrations.filter((migration) => !applied.has(migration.version));

  if (missing.length > 0) {
    const listed = missing.slice(0, 20).map((migration) => migration.version);
    const suffix =
      missing.length > listed.length ? `; plus ${missing.length - listed.length} more` : '';
    throw new Error(
      `Integrator startup migration gate failed: ${missing.length} discovered migration(s) are not applied in ${INTEGRATOR_MIGRATIONS_TABLE}: ${listed.join(', ')}${suffix}. Run deploy migrations before starting shadow/locked runtime.`,
    );
  }

  logger.info(
    {
      migrationLedger: INTEGRATOR_MIGRATIONS_TABLE,
      migrationLedgerReadColumn: ledgerShape.readColumn,
      migrationsDiscoveredCount: migrations.length,
      appliedVersionsCount: applied.size,
    },
    'Integrator startup verified all discovered migrations are applied',
  );
}

function verifyAppliedMigrationVersions(
  appliedValues: readonly string[],
  migrations: MigrationFile[],
): void {
  const applied = new Set<string>();
  for (const value of appliedValues) {
    if (!value) continue;
    for (const normalized of normalizeAppliedVersion(value, migrations)) applied.add(normalized);
  }
  const missing = migrations.filter((migration) => !applied.has(migration.version));
  if (missing.length === 0) return;
  const listed = missing.slice(0, 20).map((migration) => migration.version);
  const suffix = missing.length > listed.length ? `; plus ${missing.length - listed.length} more` : '';
  throw new Error(
    `Integrator startup migration gate failed: ${missing.length} discovered migration(s) are not applied in ${INTEGRATOR_MIGRATIONS_TABLE}: ${listed.join(', ')}${suffix}. Run deploy migrations before starting shadow/locked runtime.`,
  );
}

/** Применяет все неприменённые миграции. Вызывается из deploy/script paths и legacy startup. */
export async function runMigrations(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const db = createIntegratorMigrationPoolProvider({ connectionString: env.DATABASE_URL });

  try {
    await ensureMigrationsTable(db); // Создаём таблицу учёта миграций

    const migrations = await discoverMigrations(); // Находим все доступные
    const ledgerShape = await resolveMigrationLedgerShape(db);
    const applied = await getAppliedVersions(db, ledgerShape, migrations); // Получаем уже применённые

    logger.info(
      {
        migrationLedgerReadColumn: ledgerShape.readColumn,
        migrationLedgerWriteColumn: ledgerShape.writeColumn,
        migrationsDiscovered: migrations.map((migration) => migration.version),
        appliedVersions: [...applied].sort(),
      },
      'Discovered migrations',
    );

    // Optional phase bound (taskdb #667): when set, skip (don't even attempt) migrations whose
    // embedded filename date is >= the bound. Unset => eligible is the full `migrations` list and
    // deferred is empty, so the loop below is byte-for-byte identical to the pre-existing behavior.
    const beforeDateBoundRaw = process.env.INTEGRATOR_MIGRATIONS_BEFORE_DATE?.trim() || undefined;
    const migrationMode = process.env.INTEGRATOR_MIGRATIONS_MODE?.trim() || '';
    if (migrationMode !== '' && migrationMode !== EMPTY_BOOTSTRAP_MODE) {
      throw new Error(`Unsupported INTEGRATOR_MIGRATIONS_MODE: ${migrationMode}`);
    }
    const { eligible, deferred } = applyBeforeDateBound(migrations, beforeDateBoundRaw);

    if (beforeDateBoundRaw) {
      logger.info(
        {
          bound: beforeDateBoundRaw,
          deferredCount: deferred.length,
          deferredVersions: deferred.map((migration) => migration.version),
        },
        'INTEGRATOR_MIGRATIONS_BEFORE_DATE set: deferring migrations at/after bound to a later phase',
      );
    }

    for (const migration of eligible) {
      if (applied.has(migration.version)) {
        logger.info(
          {
            migration: migration.version,
          },
          'Skipping already applied migration',
        );
        continue;
      }

      logger.info(
        {
          scope: migration.scope,
          fileName: migration.fileName,
          migration: migration.version,
          filePath: migration.filePath,
        },
        'Applying migration',
      );

      if (
        migrationMode === EMPTY_BOOTSTRAP_MODE &&
        EMPTY_BOOTSTRAP_SUPERSEDED_MIGRATIONS.has(migration.version)
      ) {
        await recordEmptyBootstrapSupersededMigration(db, migration, ledgerShape);
        continue;
      }

      const sql = await readFile(migration.filePath, 'utf8'); // Читаем SQL
      await applyMigration(db, migration, sql, ledgerShape); // Применяем миграцию
    }
  } finally {
    await db.end(); // Закрываем соединение
  }
}

/**
 * API startup contract:
 * - legacy-guc/default keeps the historical behavior and applies pending SQL migrations;
 * - shadow/locked runtime must not run DDL as the runtime login and must prove all repo migrations
 *   are present in the integrator ledger before the API starts.
 */
export type StartupMigrationGateDeps = {
  dbPrincipalContextMode?: string;
  databaseUrl?: string;
  runMigrationsFn?: () => Promise<void>;
  createDb?: (connectionString: string) => MigrationDbClient;
  discoverMigrationsFn?: () => Promise<MigrationFile[]>;
};

export async function runStartupMigrationGateWithDeps(
  deps: StartupMigrationGateDeps = {},
): Promise<void> {
  const startupMode = resolveStartupMigrationMode(deps.dbPrincipalContextMode);

  if (startupMode === 'run-ddl-migrations') {
    await (deps.runMigrationsFn ?? runMigrations)();
    return;
  }

  if (deps.dbPrincipalContextMode?.trim() === 'port-context' && deps.createDb === undefined) {
    // The runtime login has no DDL capability and must never instantiate the legacy migration
    // pool. Ledger verification goes through the same mTLS/context chokepoint as every query.
    const [{ db: runtimePool, createDbPort }, { runWithDbInfraPrincipal }, { runIntegratorNamedRoot }] = await Promise.all([
      import('./client.js'),
      import('@bersoncare/db-principal'),
      import('./runIntegratorSql.js'),
    ]);
    const migrations = await (deps.discoverMigrationsFn ?? discoverMigrations)();
    const result = await runWithDbInfraPrincipal(
      { source: 'integrator-startup-migration-ledger' },
      () => runIntegratorNamedRoot<{ version: string }>(
        createDbPort(runtimePool), 'app.read_integrator_migration_ledger()', [],
        sql`SELECT version FROM app.read_integrator_migration_ledger()`,
      ),
    );
    verifyAppliedMigrationVersions(result.rows.map((row) => row.version), migrations);
    logger.info(
      {
        dbPrincipalContextMode: deps.dbPrincipalContextMode,
        migrationLedger: INTEGRATOR_MIGRATIONS_TABLE,
      },
      'Integrator port-context startup verified migration ledger without a DDL pool',
    );
    return;
  }

  if (!deps.databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const createDb =
    deps.createDb ??
    ((connectionString: string): MigrationDbClient =>
      createIntegratorMigrationPoolProvider({ connectionString }));
  const db = createDb(deps.databaseUrl);
  try {
    const migrations = await (deps.discoverMigrationsFn ?? discoverMigrations)();
    await verifyStartupMigrationState(db, migrations);
    logger.info(
      {
        dbPrincipalContextMode: deps.dbPrincipalContextMode,
        migrationLedger: INTEGRATOR_MIGRATIONS_TABLE,
      },
      'Integrator startup skipped DDL migrations in locked runtime topology; migration state is verified',
    );
  } finally {
    await db.end();
  }
}

export async function runStartupMigrationGate(): Promise<void> {
  await runStartupMigrationGateWithDeps({
    dbPrincipalContextMode: env.DB_PRINCIPAL_CONTEXT_MODE,
    databaseUrl:
      env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' ? env.INTEGRATOR_DB_URL : env.DATABASE_URL,
  });
}

// Запуск миграций при прямом вызове скрипта (node dist/infra/db/migrate.js)
const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  typeof process.argv[1] === 'string' &&
  (process.argv[1] === __filename || process.argv[1].endsWith('/migrate.js'));

if (isMainModule) {
  runMigrations().catch((error) => {
    logger.error({ err: error }, 'Migration process failed');
    process.exit(1);
  });
}
