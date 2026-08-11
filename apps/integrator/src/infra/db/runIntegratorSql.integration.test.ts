import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  startDisposablePostgres,
  type DisposablePostgres,
} from '../scripts/d30DisposablePostgres.js';
import { runIntegratorSql } from './runIntegratorSql.js';

describe('runIntegratorSql transaction errors on disposable PostgreSQL 16', () => {
  let disposable: DisposablePostgres;
  let adminPool: Pool;
  let runtimePool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    disposable = startDisposablePostgres('run_integrator_sql_permission');
    adminPool = new Pool({ connectionString: disposable.connectionString });
    await adminPool.query(
      'CREATE ROLE bcb_permission_oracle LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    );
    const runtimeConnectionString = disposable.connectionString.replace(
      'postgresql://postgres@/',
      'postgresql://bcb_permission_oracle@/',
    );
    runtimePool = new Pool({ connectionString: runtimeConnectionString });
    client = await runtimePool.connect();
  });

  afterAll(async () => {
    client?.release();
    await runtimePool?.end();
    await adminPool?.end();
    disposable?.stop();
  });

  it('keeps the first 42501 and never retries through DbPort.query', async () => {
    const fallback = vi.fn();
    const db = {
      integratorDrizzle: drizzle(client),
      query: fallback,
      tx: vi.fn(),
    } as unknown as DbPort;

    await client.query('BEGIN');
    let caught: unknown;
    try {
      await runIntegratorSql(db, sql`SELECT rolpassword FROM pg_catalog.pg_authid LIMIT 1`);
    } catch (error) {
      caught = error;
    } finally {
      await client.query('ROLLBACK');
    }

    expect(caught).toBeInstanceOf(Error);
    const postgresCode = (
      caught as Error & { code?: string; cause?: { code?: string } }
    ).code ?? (caught as Error & { cause?: { code?: string } }).cause?.code;
    expect(postgresCode).toBe('42501');
    expect(fallback).not.toHaveBeenCalled();
  });
});
