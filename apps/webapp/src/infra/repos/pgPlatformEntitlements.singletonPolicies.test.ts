import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getCurrentDbPrincipal: vi.fn(),
  getDrizzle: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));

import { createPgPlatformEntitlementsPort } from './pgPlatformEntitlements';
import { PLATFORM_OPERATIONS_DB_SOURCE } from '@/shared/security/platformOperationsPrincipal';
import {
  saasPaidPeriodPolicy,
  saasRegistrationTariffPolicy,
  saasTrialPolicy,
} from '../../../db/schema/saasEntitlements';
import { adminAuditLog } from '../../../db/schema/schema';

const audit = {
  actorId: '11111111-1111-4111-8111-111111111111',
  reason: 'singleton policy ACL regression proof',
};

type StoredRow = Record<string, unknown>;

function restrictedSingletonPolicyDb() {
  const rows = new Map<unknown, StoredRow[]>([
    [
      saasTrialPolicy,
      [
        {
          key: 'global',
          durationDays: 7,
          discountWindowDays: 0,
          startEvent: 'organization_provisioned',
          postTrialBehavior: 'blocked',
          postTrialTariffId: null,
          isActive: true,
          updatedBy: null,
          updatedAt: '2026-08-16T00:00:00.000Z',
        },
      ],
    ],
    [
      saasPaidPeriodPolicy,
      [
        {
          key: 'global',
          postPaidPeriodBehavior: 'blocked',
          postPaidPeriodTariffId: null,
          isActive: true,
          updatedBy: null,
          updatedAt: '2026-08-16T00:00:00.000Z',
        },
      ],
    ],
    [
      saasRegistrationTariffPolicy,
      [
        {
          key: 'global',
          tariffId: null,
          updatedBy: null,
          updatedAt: '2026-08-16T00:00:00.000Z',
        },
      ],
    ],
  ]);
  const audits: StoredRow[] = [];
  const singletonTables = new Set<unknown>([
    saasTrialPolicy,
    saasPaidPeriodPolicy,
    saasRegistrationTariffPolicy,
  ]);

  const select = () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async (count: number) => (rows.get(table) ?? []).slice(0, count),
      }),
    }),
  });
  const tx = {
    select,
    insert: (table: unknown) => ({
      values: (values: StoredRow) => {
        if (table === adminAuditLog) {
          audits.push(values);
          return Promise.resolve();
        }
        if (!singletonTables.has(table)) throw new Error('unexpected_insert_table');
        return {
          onConflictDoUpdate: ({ set }: { set: StoredRow }) => {
            // Matches the exact DEV grant: INSERT includes `key`; UPDATE deliberately does not.
            if ('key' in set) throw new Error('permission denied for column key');
            const existing = rows.get(table)?.[0];
            if (!existing) throw new Error('expected_existing_singleton_policy');
            const after = { ...existing, ...set };
            rows.set(table, [after]);
            return { returning: async () => [after] };
          },
        };
      },
    }),
  };
  return {
    db: { select, transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx) },
    audits,
  };
}

describe('createPgPlatformEntitlementsPort singleton policy UPSERTs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getCurrentDbPrincipal.mockReturnValue({
      kind: 'platform',
      source: PLATFORM_OPERATIONS_DB_SOURCE,
    });
  });

  it('updates existing global policies using only columns granted to app_platform_settings', async () => {
    const { db, audits } = restrictedSingletonPolicyDb();
    fakes.getDrizzle.mockReturnValue(db);
    const port = createPgPlatformEntitlementsPort();

    await port.setTrialPolicy(
      {
        durationDays: 21,
        discountWindowDays: 3,
        startEvent: 'organization_provisioned',
        postTrialBehavior: 'read_only',
        postTrialTariffId: null,
        isActive: false,
      },
      audit,
    );
    await port.setRegistrationTariffPolicy({ tariffId: null }, audit);
    await port.setPaidPeriodPolicy(
      { postPaidPeriodBehavior: 'read_only', postPaidPeriodTariffId: null, isActive: false },
      audit,
    );

    await expect(port.getTrialPolicy()).resolves.toEqual({
      durationDays: 21,
      discountWindowDays: 3,
      startEvent: 'organization_provisioned',
      postTrialBehavior: 'read_only',
      postTrialTariffId: null,
      isActive: false,
    });
    await expect(port.getRegistrationTariffPolicy()).resolves.toEqual({ tariffId: null });
    await expect(port.getPaidPeriodPolicy()).resolves.toEqual({
      postPaidPeriodBehavior: 'read_only',
      postPaidPeriodTariffId: null,
      isActive: false,
    });
    expect(audits).toHaveLength(3);
  });
});
