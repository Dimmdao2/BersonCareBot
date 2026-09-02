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
  runWebappSql: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: () => ({ select: fakes.select }) }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappTransaction: vi.fn(),
  runWebappSql: fakes.runWebappSql,
}));
vi.mock('@/infra/repos/pgCanonicalPlatformUser', () => ({ resolveCanonicalUserId: vi.fn() }));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { createPgDoctorClientsPort } from './pgDoctorClients';

const ORG_ID = '00000000-0000-4000-8000-0000000e0001';
const NO_ORG_LITERAL_UUID = /'[0-9a-f-]{36}'::uuid/i;

/** Text and bound values PostgreSQL would receive for the nth executed fragment. */
function executedQuery(index: number) {
  const call = fakes.runWebappSql.mock.calls[index];
  if (!call) throw new Error(`no query executed at index ${index}`);
  return drizzleSqlFragmentToPgQuery(call[1]);
}

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
    fakes.runWebappSql.mockResolvedValue({ rows: [] });
  });

  it('getClientContactBreakdown: no literal UUID in SQL text, organizationId present in params', async () => {
    await createPgDoctorClientsPort().getClientContactBreakdown({
      organizationId: ORG_ID,
      visibilityActor: { canManageAllSpecialists: true, specialistId: null, membershipRole: 'owner' },
    });

    expect(fakes.runWebappSql).toHaveBeenCalledOnce();
    const { sql: statement, values: params } = executedQuery(0);
    expect(statement).not.toContain(ORG_ID);
    expect(statement).not.toMatch(NO_ORG_LITERAL_UUID);
    expect(params).toContain(ORG_ID);
    // The predicate must reference the same positional param it pushed onto `params`.
    const orgParamIndex = params.indexOf(ORG_ID) + 1;
    expect(statement).toContain(`bea.organization_id = $${orgParamIndex}::uuid`);
  });

  it('getClientContactBreakdown: no organizationId → no appointment-org filter, no param added', async () => {
    await createPgDoctorClientsPort().getClientContactBreakdown({});

    const { sql: statement, values: params } = executedQuery(0);
    expect(statement).not.toContain('bea.organization_id');
    expect(params).toEqual([]);
  });

  it('getDashboardPatientMetrics: visited/agg counters bind organizationId, never inline it', async () => {
    await createPgDoctorClientsPort().getDashboardPatientMetrics({
      organizationId: ORG_ID,
      visibilityActor: { canManageAllSpecialists: true, specialistId: null, membershipRole: 'owner' },
    });

    for (let call = 0; call < fakes.runWebappSql.mock.calls.length; call += 1) {
      const { sql: statement, values: params } = executedQuery(call);
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
