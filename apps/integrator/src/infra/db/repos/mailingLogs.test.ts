import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { insertMailingLog } from './mailingLogs.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('mailingLogs (Drizzle onConflict)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('insertMailingLog upserts by (user_id, mailing_id) with status/sentAt/error and organization context', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertMailingLog({} as DbPort, {
      userId: 10,
      mailingId: 20,
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      userId: 10,
      mailingId: 20,
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
      organizationId: expect.anything(),
    });
    const valuesArg = values.mock.calls[0]?.[0] as { organizationId?: unknown } | undefined;
    const insertOrg = drizzleSqlFragmentToApproximateSql(valuesArg?.organizationId);
    expect(insertOrg).toContain('public.platform_users');
    expect(insertOrg).toContain('public.org_enrollments');
    expect(insertOrg).toContain('public.be_organization_members');
    expect(insertOrg).toContain('count(DISTINCT active_user_orgs.organization_id) = 1');
    expect(insertOrg).toContain('10::bigint');

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const firstCall = onConflictDoUpdate.mock.calls[0];
    expect(firstCall).toBeDefined();
    const arg = firstCall![0] as {
      set: { status: string; sentAt: string; error: string | null; organizationId?: unknown };
    };
    expect(arg.set).toEqual({
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
      organizationId: expect.anything(),
    });
    expect(drizzleSqlFragmentToApproximateSql(arg.set.organizationId)).toContain('COALESCE');
  });
});
