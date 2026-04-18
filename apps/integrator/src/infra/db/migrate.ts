// Загружаем переменные окружения (например, DATABASE_URL)
import '../../config/loadEnv.js';
import { readdir, readFile, stat } from 'fs/promises'; // Работа с файловой системой
import { join } from 'path'; // Склейка путей
import { fileURLToPath } from 'url';
import { Pool } from 'pg'; // Работа с PostgreSQL
import { getAppRoot } from '../../config/appRoot.js';
import { env } from '../../config/env.js'; // Переменные окружения
import { logger, getMigrationLogger } from '../observability/logger.js'; // Логирование

/** Учёт SQL-миграций integrator; всегда с квалификатором схемы — не совпадает с `public.schema_migrations` webapp (`filename`). */
const INTEGRATOR_MIGRATIONS_TABLE = 'integrator.schema_migrations';

// Описывает одну миграцию: область (scope), имя файла, путь и версию
type MigrationFile = {
  scope: string;
  fileName: string;
  filePath: string;
  version: string;
};

type MigrationLedgerShape = {
  readColumn: 'version' | 'filename';
  writeColumn: 'version' | 'filename';
};

function isUndefinedColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42703') return true;
  const m = String(e?.message ?? '').toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('не существует') // PostgreSQL localized messages on some installs
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
async function ensureMigrationsTable(db: Pool): Promise<void> {
  await db.query('CREATE SCHEMA IF NOT EXISTS integrator');
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${INTEGRATOR_MIGRATIONS_TABLE} (
      version text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);
}

async function resolveMigrationLedgerShape(db: Pool): Promise<MigrationLedgerShape> {
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
  db: Pool,
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

  const files = (await readdir(rootDir))
    .filter((name) => isSqlMigrationFile(name))
    .sort();

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

    const files = (await readdir(migrationsDir))
      .filter((name) => isSqlMigrationFile(name))
      .sort();

    for (const fileName of files) {
      result.push(toMigrationFile(integrationName, migrationsDir, fileName));
    }
  }

  return result;
}

// Находит все миграции (core + интеграции), порядок — по имени файла (дата+суффикс).
// Раньше шли все core, затем все интеграции; из-за этого на пустой БД core-миграции вроде
// stage13 freeze ссылались на таблицы, которые создаются только в telegram/rubitime позже.
async function discoverMigrations(): Promise<MigrationFile[]> {
  const appRoot = getAppRoot();
  const coreDir = join(appRoot, 'src', 'infra', 'db', 'migrations', 'core');
  const integrationsRoot = join(appRoot, 'src', 'integrations');

  const core = await discoverCoreMigrations(coreDir);
  const integrations = await discoverIntegrationMigrations(integrationsRoot);

  const merged = [...core, ...integrations];
  merged.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return merged;
}




// eslint-disable-next-line no-secrets/no-secrets
// 'telegram:20260306_0004_add_notification_settings.sql' — версия миграции, не секрет

async function applyMigration(
  db: Pool,
  migration: MigrationFile,
  sql: string,
  ledgerShape: MigrationLedgerShape,
): Promise<void> {
  const migrationLogger = getMigrationLogger(migration.version);
  const ledgerValue = ledgerShape.writeColumn === 'version' ? migration.version : migration.fileName;

  // Полностью идемпотентная логика для любых миграций
  await db.query('BEGIN');
  try {
    await db.query(sql); // Выполняем SQL миграции
    await db.query(`INSERT INTO ${INTEGRATOR_MIGRATIONS_TABLE}(${ledgerShape.writeColumn}) VALUES($1)`, [ledgerValue]); // Отмечаем как применённую
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
      (pgCode && safePgCodes.includes(pgCode)) ||
      safeMessages.some((m) => msg.includes(m));
    if (isSafe) {
      await db.query('ROLLBACK');
      await db.query(`INSERT INTO ${INTEGRATOR_MIGRATIONS_TABLE}(${ledgerShape.writeColumn}) VALUES($1)`, [ledgerValue]);
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

/** Применяет все неприменённые миграции. Вызывается при старте API и при запуске скрипта. */
export async function runMigrations(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const db = new Pool({ connectionString: env.DATABASE_URL });

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

    for (const migration of migrations) {
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

      const sql = await readFile(migration.filePath, 'utf8'); // Читаем SQL
      await applyMigration(db, migration, sql, ledgerShape); // Применяем миграцию
    }
  } finally {
    await db.end(); // Закрываем соединение
  }
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