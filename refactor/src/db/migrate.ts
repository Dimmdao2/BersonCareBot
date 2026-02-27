import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger, getMigrationLogger } from '../observability/logger.js';

/** Создает таблицу учета примененных миграций, если ее еще нет. */
async function ensureMigrationsTable(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);
}

/** Читает список уже примененных версий миграций. */
async function getAppliedVersions(db: Pool): Promise<Set<string>> {
  const res = await db.query('SELECT version FROM schema_migrations');
  return new Set(res.rows.map((r) => r.version));
}

/** Применяет одну SQL-миграцию в транзакции и фиксирует ее версию. */
async function applyMigration(db: Pool, version: string, sql: string) {
  await db.query('BEGIN');
  const migrationLogger = getMigrationLogger(version);
  try {
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
    await db.query('COMMIT');
    migrationLogger.info({ migration: version }, 'Applied migration');
  } catch (e) {
    await db.query('ROLLBACK');
    migrationLogger.error({ err: e }, 'Migration failed');
    throw e;
  }
}

/** Основной раннер миграций: применяет новые SQL-файлы по порядку. */
async function migrate() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const db = new Pool({ connectionString: env.DATABASE_URL });
  await ensureMigrationsTable(db);
  const applied = await getAppliedVersions(db);
  const dir = join(process.cwd(), 'migrations');
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const version = file.split('_')[0];
    if (version === undefined) continue;
    if (applied.has(version)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await applyMigration(db, version, sql);
  }
  await db.end();
}

migrate().catch((e) => {
  logger.error({ err: e }, 'Migration process failed');
  process.exit(1);
});
