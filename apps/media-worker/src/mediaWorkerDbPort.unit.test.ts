import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';
import type { MediaWorkerTransactionHandle } from './withClient.js';

type PortResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number;
};

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn<(pool: Pool) => Promise<MediaWorkerTransactionHandle>>(),
  runClientPgText:
    vi.fn<
      (
        client: Pick<PoolClient, 'query'>,
        queryText: string,
        values?: readonly unknown[],
      ) => Promise<PortResult>
    >(),
  runPoolPgText:
    vi.fn<(pool: Pool, queryText: string, values?: readonly unknown[]) => Promise<PortResult>>(),
}));

vi.mock('./withClient.js', () => ({
  startMediaWorkerTransaction: mocks.startTransaction,
}));

vi.mock('./runMediaWorkerSql.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runMediaWorkerSql.js')>();
  return {
    ...actual,
    runMediaWorkerClientPgText: mocks.runClientPgText,
    runMediaWorkerPgText: mocks.runPoolPgText,
  };
});

import { claimNextJob } from './jobs/claim.js';
import { mediaWorkerSqlFromPgText } from './runMediaWorkerSql.js';

const pgDialect = new PgDialect();

function compileLegacySql(queryText: string, values: readonly unknown[]) {
  return pgDialect.sqlToQuery(mediaWorkerSqlFromPgText(queryText, values));
}

function transactionFixture() {
  const client = { query: vi.fn() } as unknown as PoolClient;
  return {
    client,
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  } satisfies MediaWorkerTransactionHandle;
}

describe('mediaWorkerSqlFromPgText legacy binding', () => {
  it('preserves out-of-order and repeated positional parameter binding', () => {
    const compiled = compileLegacySql(
      'SELECT $2::text AS second, $1::text AS first, $2::text AS repeated',
      ['one', 'two'],
    );

    expect(compiled.sql).toBe('SELECT $1::text AS second, $2::text AS first, $3::text AS repeated');
    expect(compiled.params).toEqual(['two', 'one', 'two']);
  });

  it('keeps null and placeholder-looking strings as bound values', () => {
    const compiled = compileLegacySql('SELECT $1::text AS nullable, $2::text AS text', [
      null,
      '$1',
    ]);

    expect(compiled.params).toEqual([null, '$1']);
  });
});

describe('claimNextJob transaction lifecycle', () => {
  const pool = { connect: vi.fn() } as unknown as Pool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the same open transaction client through claim update and commits only after success', async () => {
    const tx = transactionFixture();
    mocks.startTransaction.mockResolvedValue(tx);
    mocks.runClientPgText
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'job-1',
            job_organization_id: 'org-1',
            media_organization_id: 'org-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'job-1', media_id: 'media-1', organization_id: 'org-1', attempts: 2 }],
      });

    await expect(claimNextJob(pool, 'worker-1')).resolves.toEqual({
      id: 'job-1',
      mediaId: 'media-1',
      organizationId: 'org-1',
      attempts: 2,
    });
    expect(mocks.startTransaction).toHaveBeenCalledWith(pool);
    expect(mocks.runClientPgText).toHaveBeenNthCalledWith(
      1,
      tx.client,
      expect.stringContaining('FOR UPDATE OF j SKIP LOCKED'),
    );
    expect(mocks.runClientPgText).toHaveBeenNthCalledWith(
      2,
      tx.client,
      expect.stringContaining("SET status = 'processing'"),
      ['job-1', 'worker-1'],
    );
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();
    expect(tx.release).toHaveBeenCalledOnce();
  });

  it.each(['select', 'update'] as const)(
    'rolls back and releases the transaction when the %s query fails',
    async (failurePoint) => {
      const tx = transactionFixture();
      const queryError = new Error(`${failurePoint} failed`);
      mocks.startTransaction.mockResolvedValue(tx);
      if (failurePoint === 'select') {
        mocks.runClientPgText.mockRejectedValueOnce(queryError);
      } else {
        mocks.runClientPgText
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'job-1',
                job_organization_id: 'org-1',
                media_organization_id: 'org-1',
              },
            ],
          })
          .mockRejectedValueOnce(queryError);
      }

      await expect(claimNextJob(pool, 'worker-1')).rejects.toBe(queryError);
      expect(tx.commit).not.toHaveBeenCalled();
      expect(tx.rollback).toHaveBeenCalledOnce();
      expect(tx.release).toHaveBeenCalledOnce();
    },
  );
});
