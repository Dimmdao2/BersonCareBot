import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ getDrizzle: vi.fn() }));

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappSql: vi.fn(),
}));

import { getCurrentDbPrincipal, runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { createPgPaymentsPort } from './pgPayments';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001130';
const SERVICE_ID = '00000000-0000-4000-8000-000000001131';
const STAFF_USER_ID = '00000000-0000-4000-8000-000000001132';

/**
 * Кто именно стоит у записи в момент, когда она доходит до PostgreSQL. Ровно по этому виду
 * принципала рантайм выбирает объявленную возможность порта и роль соединения, поэтому подмена
 * человека-сотрудника на служебный принципал организации отказывает ещё до SQL.
 */
type ObservedWrite = {
  principalKind: string | undefined;
  organizationId: string | undefined;
  amountMinor: unknown;
};

const writes: ObservedWrite[] = [];

/** Одна и та же таблица на все обращения запроса: порт берёт соединение заново для каждого шага. */
function fakeDrizzle(stored: Record<string, unknown>[]) {
  const db: Record<string, unknown> = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => stored.slice(0, 1) }),
      }),
    }),
    execute: async () => undefined,
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        const principal = getCurrentDbPrincipal();
        writes.push({
          principalKind: principal?.kind,
          organizationId:
            principal && 'organizationId' in principal
              ? (principal.organizationId as string | undefined)
              : undefined,
          amountMinor: row.amountMinor,
        });
        stored.push({ id: 'policy-1', percentBps: null, ...row });
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  return db;
}

describe('pgPayments prepayment policy write principal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    const stored: Record<string, unknown>[] = [];
    fakes.getDrizzle.mockImplementation(() => fakeDrizzle(stored));
  });

  it('writes the policy under the staff principal that opened the request, in integer minor units', async () => {
    const policy = await runWithDbStaffPrincipal(
      { organizationId: ORGANIZATION_ID, platformUserId: STAFF_USER_ID, source: 'request' },
      () =>
        createPgPaymentsPort().upsertPrepaymentPolicy({
          organizationId: ORGANIZATION_ID,
          serviceId: SERVICE_ID,
          onlineCategory: null,
          mode: 'fixed_minor',
          amountMinor: 50_000,
          percentBps: null,
          isActive: true,
        }),
    );

    expect(writes).toEqual([
      { principalKind: 'staff', organizationId: ORGANIZATION_ID, amountMinor: 50_000 },
    ]);
    expect(policy.amountMinor).toBe(50_000);
  });
});
