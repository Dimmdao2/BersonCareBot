// Загружаем переменные окружения (например, DATABASE_URL)
import '../../config/loadEnv.js';
import { readdir, readFile, stat } from 'fs/promises'; // Работа с файловой системой
import { join } from 'path'; // Склейка путей
import { fileURLToPath } from 'url';
import { Pool } from 'pg'; // Работа с PostgreSQL
import { env } from '../../config/env.js'; // Переменные окружения
import { logger, getMigrationLogger } from '../observability/logger.js'; // Логирование

// Описывает одну миграцию: область (scope), имя файла, путь и версию
type MigrationFile = {
  scope: string;
  fileName: string;
  filePath: string;
  version: string;
};

// Создаёт таблицу schema_migrations, если её нет (для учёта применённых миграций)
async function ensureMigrationsTable(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);
}

// Получает список уже применённых миграций из schema_migrations
async function getAppliedVersions(db: Pool): Promise<Set<string>> {
  const res = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(
    res.rows
      .map((row) => row.version)
      .filter((version): version is string => typeof version === 'string' && version.length > 0),
  );
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

// Находит все миграции (core + интеграции)
async function discoverMigrations(): Promise<MigrationFile[]> {
  const coreDir = join(process.cwd(), 'src', 'infra', 'db', 'migrations', 'core');
  const integrationsRoot = join(process.cwd(), 'src', 'integrations');

  const core = await discoverCoreMigrations(coreDir);
  const integrations = await discoverIntegrationMigrations(integrationsRoot);

  return [...core, ...integrations];
}




// eslint-disable-next-line no-secrets/no-secrets
// 'telegram:20260306_0004_add_notification_settings.sql' — версия миграции, не секрет

async function applyMigration(db: Pool, migration: MigrationFile, sql: string): Promise<void> {
  const migrationLogger = getMigrationLogger(migration.version);

  // Полностью идемпотентная логика для любых миграций
  await db.query('BEGIN');
  try {
    await db.query(sql); // Выполняем SQL миграции
    await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]); // Отмечаем как применённую
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
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]);
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

    const applied = await getAppliedVersions(db); // Получаем уже применённые
    const migrations = await discoverMigrations(); // Находим все доступные

    logger.info(
      {
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
      await applyMigration(db, migration, sql); // Применяем миграцию
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