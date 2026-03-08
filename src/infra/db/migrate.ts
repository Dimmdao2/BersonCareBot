
/** Читает список уже примененных версий миграций. */
async function getAppliedVersions(db: Pool): Promise<Set<string>> {
	const res = await db.query('SELECT version FROM schema_migrations');
	return new Set(res.rows.map((r) => r.version));
}
import '../../config/loadEnv.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { Pool } from 'pg';
import { env } from '../../config/env.js';
import { logger, getMigrationLogger } from '../observability/logger.js';

type MigrationFile = {
	scope: string;
	fileName: string;
	filePath: string;
	version: string;
};

/** Создает таблицу учета примененных миграций, если ее еще нет. */

async function ensureMigrationsTable(db: Pool) {
	await db.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version text PRIMARY KEY,
			applied_at timestamptz DEFAULT now()
		)
	`);
}

function toMigrationFile(scope: string, dirPath: string, fileName: string): MigrationFile {
	return {
		scope,
		fileName,
		filePath: join(dirPath, fileName),
		version: `${scope}:${fileName}`,
	};
}

function isSqlMigrationFile(fileName: string): boolean {
	if (!fileName.endsWith('.sql')) return false;
	if (fileName.toLowerCase().includes('example')) return false;
	return true;
}

async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const info = await stat(dirPath);
		return info.isDirectory();
	} catch {
		return false;
	}
}



async function discoverCoreMigrations(rootDir: string): Promise<MigrationFile[]> {
	if (!(await directoryExists(rootDir))) return [];
	const files = (await readdir(rootDir))
		.filter((name) => isSqlMigrationFile(name))
		.sort();
	return files.map((name) => toMigrationFile('core', rootDir, name));
}

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

async function discoverMigrations(): Promise<MigrationFile[]> {
	const coreDir = join(process.cwd(), 'src', 'infra', 'db', 'migrations', 'core');
	const integrationsRoot = join(process.cwd(), 'src', 'integrations');
	const core = await discoverCoreMigrations(coreDir);
	const integrations = await discoverIntegrationMigrations(integrationsRoot);
	return [...core, ...integrations];
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
  const migrations = await discoverMigrations();
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const sql = await readFile(migration.filePath, 'utf8');
    await applyMigration(db, migration.version, sql);
  }
  await db.end();
}

migrate().catch((e) => {
	logger.error({ err: e }, 'Migration process failed');
	process.exit(1);
});
