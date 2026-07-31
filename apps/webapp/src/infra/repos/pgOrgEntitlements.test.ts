import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn());
const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: getDrizzleMock }));

import { createPgOrgEntitlementsPort } from './pgOrgEntitlements';

/**
 * `getOwnQuotaUsage` issues six sequential `db.select(...)` calls (branches, patient_count, files,
 * then the three-part specialist-seat formula). Each `.select()` claims the next row-set from
 * `resultsQueue` in call order; `.from`/`.where`/`.innerJoin` are no-ops that just keep the chain
 * awaitable, matching how the real drizzle query builder is used in `pgOrgEntitlements.ts`.
 */
function stubSequentialDrizzleSelects(resultsQueue: Array<Array<{ value: number }>>) {
  let callIndex = 0;
  return {
    select: () => {
      const index = callIndex;
      callIndex += 1;
      const node = {
        from: () => node,
        innerJoin: () => node,
        where: () => node,
        then: (resolve: (rows: Array<{ value: number }>) => void) =>
          Promise.resolve(resultsQueue[index] ?? []).then(resolve),
      };
      return node;
    },
  };
}

describe('createPgOrgEntitlementsPort usage projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalMock.mockReturnValue(null);
  });

  it('reports specialist-seat and branch usage only, never a courses count (courses is a toggle, not a quota)', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ clinic_team_used: 3 }] });
    getDrizzleMock.mockReturnValue(stubSequentialDrizzleSelects([[{ value: 2 }]]));

    await expect(
      createPgOrgEntitlementsPort().getEnforcedQuotaUsage('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ clinic_team: 3, branches: 2 });
  });

  it('§5a stage 6.1 — sums the three-part seat formula and reports every quota number for the caller\'s own organization', async () => {
    getDrizzleMock.mockReturnValue(
      stubSequentialDrizzleSelects([
        [{ value: 2 }], // branches (active)
        [{ value: 7 }], // patient_count (invited + active)
        [{ value: 12345 }], // files (summed bytes)
        [{ value: 3 }], // clinic_team: active members with a seat
        [{ value: 1 }], // clinic_team: pending doctor invites
        [{ value: 1 }], // clinic_team: accepted doctor invites still missing a seat
      ]),
    );

    await expect(
      createPgOrgEntitlementsPort().getOwnQuotaUsage('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ branches: 2, patient_count: 7, files: 12345, clinic_team: 5 });
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
            notifications: [],
            terminalState: 'disabled',
          },
          tariff_mechanic_access_policies: {
            courses: {
              graceDays: 2,
              readOnlyDays: 4,
              notifications: [],
              terminalState: 'read_only',
            },
          },
          included_seats: null,
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
      notifications: [],
    });
    expect(snapshot.tariff?.mechanicAccessPolicies.courses).toMatchObject({
      graceDays: 2,
      readOnlyDays: 4,
      notifications: [],
      terminalState: 'read_only',
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
