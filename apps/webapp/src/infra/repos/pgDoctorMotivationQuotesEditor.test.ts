import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const txExecutorMock = vi.hoisted(() => ({ __kind: 'tx-executor' }));
const runWebappTransactionMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: typeof txExecutorMock) => Promise<unknown>) => fn(txExecutorMock)),
);
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@/infra/db/runWebappSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/db/runWebappSql')>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
    runWebappTransaction: runWebappTransactionMock,
  };
});

vi.mock('@/infra/db/client', () => ({
  getPool: getPoolMock,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(async () => []),
      })),
    })),
  })),
}));

import { createPgDoctorMotivationQuotesEditorPort } from './pgDoctorMotivationQuotesEditor';

describe('pgDoctorMotivationQuotesEditor', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockClear();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('upsertQuote updates existing row via the transaction executor', async () => {
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.upsertQuote({
      id: 'q1',
      bodyText: 'Hello',
      author: 'A',
      isActive: true,
      sortOrder: 2,
    });

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('UPDATE motivational_quotes');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['q1', 'Hello', 'A', true, 2]);
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBe(txExecutorMock);
  });

  it('upsertQuote inserts with next sort_order', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ n: '3' }] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.upsertQuote({
      bodyText: 'New',
      author: null,
      isActive: false,
    });

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('MAX(sort_order)');
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBe(txExecutorMock);
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain(
      'INSERT INTO motivational_quotes',
    );
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual(['New', null, false, 3]);
    expect(runWebappPgTextMock.mock.calls[1]?.[2]).toBe(txExecutorMock);
  });

  it('setQuoteArchived updates archived_at via the transaction executor', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.setQuoteArchived('q1', true);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('archived_at');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[0]).toBe('q1');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[1]).toBeInstanceOf(Date);
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBe(txExecutorMock);
  });

  it('setQuoteActive updates is_active via the transaction executor', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.setQuoteActive('q1', false);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('is_active = $2');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['q1', false]);
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBe(txExecutorMock);
  });

  it('reorderQuotes runs updates in transaction', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.reorderQuotes(['b', 'a']);

    expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
    expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([0, 'b']);
    expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([1, 'a']);
  });

  it('reorderQuotes applies current organization principal through the transaction chokepoint', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await runWithDbOrganizationPrincipal(ORGANIZATION_ID, () => port.reorderQuotes(['b', 'a']));

    const sqlOrder = clientQueryMock.mock.calls.map((call) => String(call[0]));
    expect(sqlOrder.indexOf('BEGIN')).toBeGreaterThanOrEqual(0);
    expect(sqlOrder.indexOf("SELECT set_config('app.org', $1, true)")).toBeGreaterThan(
      sqlOrder.indexOf('BEGIN'),
    );
    expect(clientQueryMock).toHaveBeenCalledWith("SELECT set_config('app.org', $1, true)", [
      ORGANIZATION_ID,
    ]);
    expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
  });

  it('reorderQuotes rolls back when id count mismatches db', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: 'a' }] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await expect(port.reorderQuotes(['a', 'b'])).rejects.toThrow('mismatch');

    expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
    expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQueryMock).not.toHaveBeenCalledWith('COMMIT');
  });

  it('reorderQuotes rolls back when ordered id is unknown', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await expect(port.reorderQuotes(['a', 'missing'])).rejects.toThrow('unknown');

    expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
  });
});
