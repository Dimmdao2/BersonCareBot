import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgOrgEntitlementsPort } from './pgOrgEntitlements';

describe('createPgOrgEntitlementsPort usage projection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps specialist-seat usage available after the CMS usage function is removed', async () => {
    runWebappPgTextMock.mockImplementation(async () => {
      if (runWebappPgTextMock.mock.calls.length > 1) {
        throw new Error('function app.cms_pages_snapshot_usage(uuid) does not exist');
      }
      return { rows: [{ courses_used: 2, clinic_team_used: 3 }] };
    });

    await expect(
      createPgOrgEntitlementsPort().getEnforcedQuotaUsage('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ courses: 2, clinic_team: 3 });
  });
});
