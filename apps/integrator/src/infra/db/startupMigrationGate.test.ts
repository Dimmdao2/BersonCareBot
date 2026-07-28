import { describe, expect, it } from 'vitest';
import {
  resolveStartupMigrationMode,
  runStartupMigrationGateWithDeps,
  type MigrationDbClient,
  type MigrationFile,
} from './migrate.js';

function migration(fileName: string): MigrationFile {
  return {
    scope: 'core',
    fileName,
    filePath: `/fake/${fileName}`,
    version: `core:${fileName}`,
  };
}

type FakeQueryHandler = (
  text: string,
  values: unknown[] | undefined,
) => Promise<{ rows: object[] }>;

class FakeMigrationDb implements MigrationDbClient {
  readonly queries: string[] = [];
  ended = false;

  constructor(private readonly handler: FakeQueryHandler) {}

  async query<T extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }> {
    this.queries.push(text);
    const result = await this.handler(text, values);
    return { rows: result.rows as T[] };
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

function dbWithAppliedVersions(appliedVersions: string[]): FakeMigrationDb {
  return new FakeMigrationDb(async (text) => {
    if (text === 'SELECT to_regclass($1) AS ledger_regclass') {
      return { rows: [{ ledger_regclass: 'integrator.schema_migrations' }] };
    }
    if (text.includes('SELECT version FROM integrator.schema_migrations LIMIT 0')) {
      return { rows: [] };
    }
    if (text.includes('SELECT version AS value FROM integrator.schema_migrations')) {
      return { rows: appliedVersions.map((value) => ({ value })) };
    }
    throw new Error(`unexpected query: ${text}`);
  });
}

describe('integrator startup migration gate', () => {
  it('preserves legacy startup DDL migrations by default', () => {
    expect(resolveStartupMigrationMode(undefined)).toBe('run-ddl-migrations');
    expect(resolveStartupMigrationMode('')).toBe('run-ddl-migrations');
    expect(resolveStartupMigrationMode('legacy-guc')).toBe('run-ddl-migrations');
  });

  it('uses non-DDL migration-state verification in shadow and locked runtime modes', () => {
    expect(resolveStartupMigrationMode('shadow')).toBe('verify-ledger-only');
    expect(resolveStartupMigrationMode('locked')).toBe('verify-ledger-only');
  });

  it('locked mode passes when all discovered migrations are applied', async () => {
    const migrations = [migration('20260708_0001_a.sql'), migration('20260708_0002_b.sql')];
    const db = dbWithAppliedVersions(migrations.map((item) => item.version));

    await runStartupMigrationGateWithDeps({
      dbPrincipalContextMode: 'locked',
      databaseUrl: 'test-db-url',
      createDb: () => db,
      discoverMigrationsFn: async () => migrations,
    });

    expect(db.ended).toBe(true);
    expect(db.queries.some((query) => query.startsWith('CREATE ') || query === 'BEGIN')).toBe(
      false,
    );
  });

  it('locked mode fails when the integrator migration ledger is missing', async () => {
    const db = new FakeMigrationDb(async (text) => {
      if (text === 'SELECT to_regclass($1) AS ledger_regclass') {
        return { rows: [{ ledger_regclass: null }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    await expect(
      runStartupMigrationGateWithDeps({
        dbPrincipalContextMode: 'locked',
        databaseUrl: 'test-db-url',
        createDb: () => db,
        discoverMigrationsFn: async () => [migration('20260708_0001_a.sql')],
      }),
    ).rejects.toThrow(/integrator\.schema_migrations is missing/);
    expect(db.ended).toBe(true);
  });

  it('locked mode fails when any discovered migration is not applied', async () => {
    const applied = migration('20260708_0001_a.sql');
    const missing = migration('20260708_0002_b.sql');
    const db = dbWithAppliedVersions([applied.version]);

    await expect(
      runStartupMigrationGateWithDeps({
        dbPrincipalContextMode: 'locked',
        databaseUrl: 'test-db-url',
        createDb: () => db,
        discoverMigrationsFn: async () => [applied, missing],
      }),
    ).rejects.toThrow(/not applied.*core:20260708_0002_b\.sql/);
    expect(db.ended).toBe(true);
  });

  it('locked mode treats ledger SELECT permission denied as fatal', async () => {
    const permissionDenied = Object.assign(
      new Error('permission denied for table schema_migrations'),
      {
        code: '42501',
      },
    );
    const db = new FakeMigrationDb(async (text) => {
      if (text === 'SELECT to_regclass($1) AS ledger_regclass') {
        return { rows: [{ ledger_regclass: 'integrator.schema_migrations' }] };
      }
      if (text.includes('SELECT version FROM integrator.schema_migrations LIMIT 0')) {
        throw permissionDenied;
      }
      throw new Error(`unexpected query: ${text}`);
    });

    await expect(
      runStartupMigrationGateWithDeps({
        dbPrincipalContextMode: 'locked',
        databaseUrl: 'test-db-url',
        createDb: () => db,
        discoverMigrationsFn: async () => [migration('20260708_0001_a.sql')],
      }),
    ).rejects.toThrow(/permission denied for table schema_migrations/);
    expect(db.ended).toBe(true);
  });

  it('legacy startup calls runMigrations instead of creating a verification pool', async () => {
    let runMigrationsCalls = 0;

    await runStartupMigrationGateWithDeps({
      dbPrincipalContextMode: 'legacy-guc',
      runMigrationsFn: async () => {
        runMigrationsCalls += 1;
      },
      createDb: () => {
        throw new Error('legacy mode must not create a verification pool');
      },
      discoverMigrationsFn: async () => {
        throw new Error('legacy mode must not discover migrations through verification');
      },
    });

    expect(runMigrationsCalls).toBe(1);
  });
});
