import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
}));

import { createPgOrgEntitlementsPort } from './pgOrgEntitlements';

describe('createPgOrgEntitlementsPort usage projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalMock.mockReturnValue(null);
  });

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

  it('projects lifecycle policies from the patient database capability', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    getCurrentDbPrincipalMock.mockReturnValue({
      kind: 'patient',
      organizationId,
      platformUserId: '22222222-2222-4222-8222-222222222222',
    });
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          tariff_mechanics: { courses: true },
          tariff_quotas: {},
          tariff_system_access_policy: {
            graceDays: 5,
            readOnlyDays: 2,
            warningCount: 3,
            terminalState: 'disabled',
          },
          tariff_mechanic_access_policies: {
            courses: {
              graceDays: 2,
              readOnlyDays: 4,
              warningCount: 1,
              terminalState: 'full_access',
            },
          },
          included_seats: null,
          included_seats_warning_at_percent: null,
          override_mechanic: null,
          override_enabled: null,
          override_quota: null,
          override_expires_at: null,
          seat_limit_override: null,
          lifecycle: 'grace',
          effective_tariff_id: '33333333-3333-4333-8333-333333333333',
          access_source: 'trial',
          degradation_started_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    const snapshot = await createPgOrgEntitlementsPort().getSnapshot(organizationId);

    expect(snapshot.tariff?.systemAccessPolicy).toMatchObject({
      graceDays: 5,
      warningCount: 3,
    });
    expect(snapshot.tariff?.mechanicAccessPolicies.courses).toMatchObject({
      graceDays: 2,
      readOnlyDays: 4,
      warningCount: 1,
      terminalState: 'full_access',
    });
  });

  it('maps the canonical database door result without recomputing lifecycle in TypeScript', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          state: 'grace',
          policy_source: 'mechanic',
          warning: {
            until: '2026-07-03T00:00:00.000Z',
            count: 1,
            nextState: 'read_only',
          },
        },
      ],
    });

    await expect(
      createPgOrgEntitlementsPort().resolveMechanicAccess(
        '11111111-1111-4111-8111-111111111111',
        'courses',
      ),
    ).resolves.toEqual({
      mechanic: 'courses',
      state: 'grace',
      policySource: 'mechanic',
      warning: {
        until: '2026-07-03T00:00:00.000Z',
        count: 1,
        nextState: 'read_only',
      },
    });
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('app.resolve_organization_mechanic_access'),
      ['11111111-1111-4111-8111-111111111111', 'courses'],
    );
  });
});
