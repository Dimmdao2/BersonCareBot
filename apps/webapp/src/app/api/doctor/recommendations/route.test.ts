import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

const listRecommendations = vi.fn(async () => []);
const listActiveItemsByCategoryCode = vi.fn(async () => {
  const { inMemoryReferencesPort } = await import('@/infra/repos/inMemoryReferences');
  const { RECOMMENDATION_TYPE_CATEGORY_CODE } =
    await import('@/modules/recommendations/recommendationDomain');
  return inMemoryReferencesPort.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    references: { listActiveItemsByCategoryCode },
    recommendations: { listRecommendations },
  }),
}));

import { GET } from './route';

describe('GET /api/doctor/recommendations', () => {
  beforeEach(() => {
    listRecommendations.mockClear();
    listActiveItemsByCategoryCode.mockClear();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: '10000000-0000-4000-8000-000000000001' },
    });
  });

  it('returns 400 invalid_query with field region when region is not a UUID', async () => {
    const res = await GET(
      new Request('http://localhost/api/doctor/recommendations?region=not-a-uuid'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string; field?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_query');
    expect(body.field).toBe('region');
    expect(listRecommendations).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_query with field domain when domain is not in catalog', async () => {
    const res = await GET(
      new Request('http://localhost/api/doctor/recommendations?domain=__not_in_catalog__'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; field?: string };
    expect(body.field).toBe('domain');
    expect(listRecommendations).not.toHaveBeenCalled();
  });

  it('lists when query is valid', async () => {
    listRecommendations.mockResolvedValueOnce([]);
    const region = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const res = await GET(
      new Request(`http://localhost/api/doctor/recommendations?region=${region}&domain=nutrition`),
    );
    expect(res.status).toBe(200);
    expect(listRecommendations).toHaveBeenCalledWith({
      search: null,
      includeArchived: false,
      regionRefId: region,
      domain: 'nutrition',
    });
  });

  it('treats includeArchived=false query as active-only', async () => {
    listRecommendations.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://localhost/api/doctor/recommendations?includeArchived=false'),
    );
    expect(res.status).toBe(200);
    expect(listRecommendations).toHaveBeenCalledWith({
      search: null,
      includeArchived: false,
      regionRefId: null,
      domain: null,
    });
  });
});
