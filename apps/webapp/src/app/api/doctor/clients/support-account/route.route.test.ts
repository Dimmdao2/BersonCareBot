import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { platformUsers, userContacts } from '../../../../../../db/schema/schema';

type RecordedOperation = {
  kind: 'delete' | 'update';
  table: unknown;
  values?: Record<string, unknown>;
  whereParams: unknown[];
};

const fakes = vi.hoisted(() => ({
  getDrizzle: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { POST } from './route';

const firstAccountId = '00000000-0000-4000-8000-000000000001';
const secondAccountId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000099';
const dialect = new PgDialect();
let operations: RecordedOperation[];

function request(body: unknown): Request {
  return new Request('http://localhost/api/doctor/clients/support-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: actorId } },
  });
  fakes.getDrizzle.mockReturnValue({
    delete: (table: unknown) => ({
      where: async (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
        operations.push({
          kind: 'delete',
          table,
          whereParams: dialect.sqlToQuery(condition).params,
        });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
          operations.push({
            kind: 'update',
            table,
            values,
            whereParams: dialect.sqlToQuery(condition).params,
          });
        },
      }),
    }),
  });
});

describe('POST /api/doctor/clients/support-account', () => {
  it('revokes only the selected contact from the selected account', async () => {
    const response = await POST(
      request({
        action: 'revoke_contact',
        userId: secondAccountId,
        contactKind: 'phone',
        valueNormalized: '+79990000002',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(operations).toEqual([
      {
        kind: 'delete',
        table: userContacts,
        whereParams: [secondAccountId, 'phone', '+79990000002'],
      },
    ]);
  });

  it('blocks one selected account and unblocks the other without swapping ids', async () => {
    await POST(
      request({ action: 'set_blocked', userId: firstAccountId, blocked: true, reason: 'review' }),
    );
    await POST(request({ action: 'set_blocked', userId: secondAccountId, blocked: false }));

    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({
      kind: 'update',
      table: platformUsers,
      values: { isBlocked: true, blockedReason: 'review', blockedBy: actorId },
      whereParams: [firstAccountId],
    });
    expect(operations[1]).toMatchObject({
      kind: 'update',
      table: platformUsers,
      values: { isBlocked: false, blockedAt: null, blockedReason: null, blockedBy: null },
      whereParams: [secondAccountId],
    });
  });
});
