/**
 * Census finding 0.3 (`docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md`): the
 * `canonicalAppointmentOrgPredicate` helper used to glue `organizationId` into the query text as
 * a hand-escaped `'…'::uuid` literal (`sqlLiteralUuid`) instead of binding it as a `$n` parameter.
 * These tests are the behavioural proof that the fix changed *how* the value travels, not *what*
 * the query returns: the emitted SQL carries a placeholder, never the raw id, and the id itself
 * still reaches the driver — as a bound parameter instead of inlined text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappPgText: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: () => ({ select: fakes.select }) }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappTransaction: vi.fn(),
  runWebappPgText: fakes.runWebappPgText,
}));
vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({ resolveCanonicalUserId: vi.fn() }));

import { createPgDoctorClientsPort } from './pgDoctorClients';

const ORG_ID = '00000000-0000-4000-8000-0000000e0001';
const NO_ORG_LITERAL_UUID = /'[0-9a-f-]{36}'::uuid/i;

function emptyDrizzleChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.innerJoin = vi.fn(self);
  chain.where = vi.fn(self);
  chain.groupBy = vi.fn(async () => []);
  return chain;
}

describe('pgDoctorClients — organization id travels as a bound $n param, not a literal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.select.mockImplementation(() => emptyDrizzleChain());
    fakes.runWebappPgText.mockResolvedValue({ rows: [] });
  });

  it('getClientContactBreakdown: no literal UUID in SQL text, organizationId present in params', async () => {
    await createPgDoctorClientsPort().getClientContactBreakdown({
      organizationId: ORG_ID,
      visibilityActor: { canManageAllSpecialists: true, specialistId: null, membershipRole: 'owner' },
    });

    expect(fakes.runWebappPgText).toHaveBeenCalledOnce();
    const [statement, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(statement).not.toContain(ORG_ID);
    expect(statement).not.toMatch(NO_ORG_LITERAL_UUID);
    expect(params).toContain(ORG_ID);
    // The predicate must reference the same positional param it pushed onto `params`.
    const orgParamIndex = params.indexOf(ORG_ID) + 1;
    expect(statement).toContain(`bea.organization_id = $${orgParamIndex}::uuid`);
  });

  it('getClientContactBreakdown: no organizationId → no appointment-org filter, no param added', async () => {
    await createPgDoctorClientsPort().getClientContactBreakdown({});

    const [statement, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(statement).not.toContain('bea.organization_id');
    expect(params).toEqual([]);
  });

  it('getDashboardPatientMetrics: visited/agg counters bind organizationId, never inline it', async () => {
    await createPgDoctorClientsPort().getDashboardPatientMetrics({
      organizationId: ORG_ID,
      visibilityActor: { canManageAllSpecialists: true, specialistId: null, membershipRole: 'owner' },
    });

    for (const [statement, params] of fakes.runWebappPgText.mock.calls as [string, unknown[]][]) {
      expect(statement).not.toContain(ORG_ID);
      expect(statement).not.toMatch(NO_ORG_LITERAL_UUID);
      if (statement.includes('bea.organization_id')) {
        const orgParamIndex = params.indexOf(ORG_ID) + 1;
        expect(orgParamIndex).toBeGreaterThan(0);
        expect(statement).toContain(`bea.organization_id = $${orgParamIndex}::uuid`);
      }
    }
  });
});
