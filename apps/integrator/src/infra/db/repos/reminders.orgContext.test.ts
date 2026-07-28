import { describe, expect, it, vi } from 'vitest';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import type { DbPort, ReminderRuleRecord } from '../../../kernel/contracts/index.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import {
  createContentAccessGrant,
  insertReminderDeliveryLog,
  upsertReminderOccurrencePlanned,
  upsertReminderRule,
} from './reminders.js';

type InsertCapture = {
  values: Record<string, unknown>;
  conflictSet?: Record<string, unknown>;
};

function sqlText(value: unknown): string {
  return drizzleSqlFragmentToApproximateSql(value);
}

function createCaptureDb(captures: InsertCapture[]): DbPort {
  const query = vi.fn().mockResolvedValue({ rows: [] }) as DbPort['query'];
  const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) =>
    fn({ query, tx } as DbPort),
  ) as DbPort['tx'];
  const insert = () => ({
    values: (values: Record<string, unknown>) => {
      const capture: InsertCapture = { values };
      captures.push(capture);
      return {
        onConflictDoUpdate: (input: { set: Record<string, unknown> }) => {
          capture.conflictSet = input.set;
          return {
            returning: async <T>() => [{ updated_at: '2026-01-01T00:00:00.000Z' }] as T[],
          };
        },
        onConflictDoNothing: async () => undefined,
        returning: async <T>() => [{ created_at: '2026-01-01T00:00:00.000Z' }] as T[],
      };
    },
  });
  return {
    query,
    tx,
    integratorDrizzle: {
      insert,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as DbPort['integratorDrizzle'],
  } as DbPort;
}

function reminderRule(overrides: Partial<ReminderRuleRecord> = {}): ReminderRuleRecord {
  return {
    id: 'rule-1',
    userId: '42',
    category: 'exercise',
    isEnabled: true,
    scheduleType: 'daily',
    timezone: 'Europe/Moscow',
    intervalMinutes: 60,
    windowStartMinute: 0,
    windowEndMinute: 1440,
    daysMask: '1111111',
    contentMode: 'none',
    notificationTopicCode: null,
    ...overrides,
  };
}

describe('reminders repo organization context writes', () => {
  it('stamps reminder rules from current principal with single active org fallback', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const captures: InsertCapture[] = [];
    const db = createCaptureDb(captures);

    await runWithDbOrganizationPrincipal(organizationId, () =>
      upsertReminderRule(db, reminderRule()),
    );

    const insertOrg = sqlText(captures[0]?.values.organizationId);
    expect(insertOrg).toContain(organizationId);
    expect(insertOrg).toContain('public.platform_users');
    expect(insertOrg).toContain('public.org_enrollments');
    expect(insertOrg).toContain('public.be_organization_members');
    expect(insertOrg).toContain('count(DISTINCT active_user_orgs.organization_id) = 1');

    const updateOrg = sqlText(captures[0]?.conflictSet?.organizationId);
    expect(updateOrg).toContain('COALESCE');
    expect(updateOrg).toContain(organizationId);
  });

  it('copies reminder occurrence and delivery-log organization from parent rows', async () => {
    const captures: InsertCapture[] = [];
    const db = createCaptureDb(captures);

    await upsertReminderOccurrencePlanned(db, {
      id: 'occ-1',
      ruleId: 'rule-1',
      occurrenceKey: 'rule-1:2026-01-01',
      plannedAt: '2026-01-01T10:00:00.000Z',
    });
    await insertReminderDeliveryLog(db, {
      id: 'log-1',
      occurrenceId: 'occ-1',
      channel: 'telegram',
      status: 'success',
    });

    expect(sqlText(captures[0]?.values.organizationId)).toContain(
      'SELECT organization_id FROM user_reminder_rules',
    );
    expect(sqlText(captures[1]?.values.organizationId)).toContain(
      'SELECT organization_id FROM user_reminder_occurrences',
    );
  });

  it('stamps content access grants from current principal with single active org fallback', async () => {
    const organizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const captures: InsertCapture[] = [];
    const db = createCaptureDb(captures);

    await runWithDbOrganizationPrincipal(organizationId, () =>
      createContentAccessGrant(db, {
        id: 'grant-1',
        userId: '42',
        contentId: 'content-1',
        purpose: 'view',
        expiresAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    const grantOrg = sqlText(captures[0]?.values.organizationId);
    expect(grantOrg).toContain(organizationId);
    expect(grantOrg).toContain('public.platform_users');
    expect(grantOrg).toContain('count(DISTINCT active_user_orgs.organization_id) = 1');
  });
});
