import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFileSync } from 'node:fs';

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
  saasOrgEntitlementOverrides,
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

function insertColumns(sql: string): string[] {
  const match = /^insert into "[^"]+" \(([^)]+)\)/iu.exec(sql);
  if (!match?.[1]) throw new Error(`unexpected_insert_sql:${sql}`);
  return match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
}

function grantedInsertColumns(tableName: string): Set<string> {
  const generatedSql = readFileSync(
    new URL('../../../../../deploy/postgres/generated/privileges.bcb_webapp_dev.sql', import.meta.url),
    'utf8',
  );
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `GRANT INSERT \\(([^)]+)\\) ON TABLE "public"\\."${escapedTableName}" TO "app_platform_settings";`,
    'u',
  ).exec(generatedSql);
  if (!match?.[1]) throw new Error(`missing_platform_insert_grant:${tableName}`);
  return new Set(match[1].split(',').map((column) => column.trim().replaceAll('"', '')));
}

function updateColumns(sql: string): string[] {
  const match = /do update set (.+?) returning/iu.exec(sql);
  if (!match?.[1]) throw new Error(`unexpected_update_sql:${sql}`);
  return [...match[1].matchAll(/"([^"]+)"\s*=/gu)].map((column) => column[1]);
}

function grantedUpdateColumns(tableName: string): Set<string> {
  const generatedSql = readFileSync(
    new URL('../../../../../deploy/postgres/generated/privileges.bcb_webapp_dev.sql', import.meta.url),
    'utf8',
  );
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `GRANT UPDATE \\(([^)]+)\\) ON TABLE "public"\\."${escapedTableName}" TO "app_platform_settings";`,
    'u',
  ).exec(generatedSql);
  if (!match?.[1]) throw new Error(`missing_platform_update_grant:${tableName}`);
  return new Set(match[1].split(',').map((column) => column.trim().replaceAll('"', '')));
}

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

  it('grants every column emitted by Drizzle for singleton policy INSERTs', () => {
    const db = drizzle.mock();
    const updatedAt = '2026-08-16T00:00:00.000Z';
    const actorId = audit.actorId;
    const statements = [
      {
        tableName: 'saas_trial_policy',
        sql: db
          .insert(saasTrialPolicy)
          .values({
            key: 'global',
            durationDays: 21,
            discountWindowDays: 3,
            startEvent: 'organization_provisioned',
            postTrialBehavior: 'read_only',
            postTrialTariffId: null,
            isActive: false,
            updatedBy: actorId,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: saasTrialPolicy.key,
            set: {
              durationDays: 21,
              discountWindowDays: 3,
              startEvent: 'organization_provisioned',
              postTrialBehavior: 'read_only',
              postTrialTariffId: null,
              isActive: false,
              updatedBy: actorId,
              updatedAt,
            },
          })
          .returning()
          .toSQL().sql,
      },
      {
        tableName: 'saas_registration_tariff_policy',
        sql: db
          .insert(saasRegistrationTariffPolicy)
          .values({ key: 'global', tariffId: null, updatedBy: actorId, updatedAt })
          .onConflictDoUpdate({
            target: saasRegistrationTariffPolicy.key,
            set: { tariffId: null, updatedBy: actorId, updatedAt },
          })
          .returning()
          .toSQL().sql,
      },
      {
        tableName: 'saas_paid_period_policy',
        sql: db
          .insert(saasPaidPeriodPolicy)
          .values({
            key: 'global',
            postPaidPeriodBehavior: 'read_only',
            postPaidPeriodTariffId: null,
            isActive: false,
            updatedBy: actorId,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: saasPaidPeriodPolicy.key,
            set: {
              postPaidPeriodBehavior: 'read_only',
              postPaidPeriodTariffId: null,
              isActive: false,
              updatedBy: actorId,
              updatedAt,
            },
          })
          .returning()
          .toSQL().sql,
      },
    ];

    for (const statement of statements) {
      const granted = grantedInsertColumns(statement.tableName);
      const missing = insertColumns(statement.sql).filter((column) => !granted.has(column));
      expect(missing, statement.tableName).toEqual([]);
    }
  });

  it('keeps entitlement override UPSERT conflict keys immutable and grants its emitted columns', () => {
    const db = drizzle.mock();
    const updatedAt = '2026-08-16T00:00:00.000Z';
    const values = {
      organizationId: '22222222-2222-4222-8222-222222222222',
      mechanic: 'warmups',
      enabled: true,
      quota: null,
      expiresAt: null,
      updatedAt,
    };
    const sql = db
      .insert(saasOrgEntitlementOverrides)
      .values(values)
      .onConflictDoUpdate({
        target: [
          saasOrgEntitlementOverrides.organizationId,
          saasOrgEntitlementOverrides.mechanic,
        ],
        set: {
          enabled: values.enabled,
          quota: values.quota,
          expiresAt: values.expiresAt,
          updatedAt: values.updatedAt,
        },
      })
      .returning()
      .toSQL().sql;

    const insertedMissing = insertColumns(sql).filter(
      (column) => !grantedInsertColumns('saas_org_entitlement_overrides').has(column),
    );
    const updated = updateColumns(sql);
    const updatedMissing = updated.filter(
      (column) => !grantedUpdateColumns('saas_org_entitlement_overrides').has(column),
    );

    expect(insertedMissing).toEqual([]);
    expect(updated).not.toContain('organization_id');
    expect(updated).not.toContain('mechanic');
    expect(updatedMissing).toEqual([]);
  });
});
