import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));
const principalOrganizationIdMock = vi.hoisted(() => vi.fn());
const rootRowsMock = vi.hoisted(() => vi.fn());

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => principalOrganizationIdMock(),
}));

vi.mock('@/infra/db/client', () => ({
  getPool: getPoolMock,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rootRowsMock()),
          orderBy: vi.fn(async () => []),
        })),
        orderBy: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 'x' }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: 'x' }]),
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgRecommendationsPort } from './pgRecommendations';

describe('createPgRecommendationsPort usage summary', () => {
  beforeEach(() => {
    queryMock.mockReset();
    principalOrganizationIdMock.mockReset();
    principalOrganizationIdMock.mockReturnValue(ORG_A);
    rootRowsMock.mockReset();
    rootRowsMock.mockReturnValue([{ id: '00000000-0000-4000-8000-000000000099' }]);
  });

  it('getRecommendationUsageSummary runs aggregate query for recommendation refs', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          published_tp_templates: 0,
          draft_tp_templates: 0,
          archived_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          archived_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgRecommendationsPort();
    await port.getRecommendationUsageSummary('00000000-0000-4000-8000-000000000099');
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('si.item_ref_id = $1::uuid');
    expect(sql).toContain("item_type = 'recommendation'");
    expect(sql).toContain('organization_id = $2::uuid');
    expect(new Set(queryMock.mock.calls[0]?.[1] as string[])).toEqual(
      new Set(['00000000-0000-4000-8000-000000000099', ORG_A]),
    );
  });

  it('binds the same recommendation usage id to the current organization and rejects a missing principal', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const port = createPgRecommendationsPort();
    await port.getRecommendationUsageSummary('00000000-0000-4000-8000-000000000099');
    principalOrganizationIdMock.mockReturnValue(ORG_B);
    await port.getRecommendationUsageSummary('00000000-0000-4000-8000-000000000099');
    expect(queryMock.mock.calls.map((call) => new Set(call[1] as string[]))).toEqual([
      new Set(['00000000-0000-4000-8000-000000000099', ORG_A]),
      new Set(['00000000-0000-4000-8000-000000000099', ORG_B]),
    ]);
    principalOrganizationIdMock.mockReturnValue(null);
    await expect(
      port.getRecommendationUsageSummary('00000000-0000-4000-8000-000000000099'),
    ).rejects.toThrow('organization_principal_required');
  });

  it('does not load usage refs when the requested recommendation is foreign or NULL-owned', async () => {
    rootRowsMock.mockReturnValue([]);
    const port = createPgRecommendationsPort();
    await expect(
      port.getRecommendationUsageSummary('00000000-0000-4000-8000-000000000099'),
    ).resolves.toMatchObject({
      activeTreatmentProgramInstanceCount: 0,
      activeTreatmentProgramInstanceRefs: [],
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('catalog writes use the Drizzle mutation transaction chokepoint', () => {
    const src = readFileSync(new URL('./pgRecommendations.ts', import.meta.url), 'utf8');
    expect(src).toContain('runDrizzleMutationTransaction');
    expect(src.match(/runDrizzleMutationTransaction/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(src).not.toContain('db.transaction');
  });
});
