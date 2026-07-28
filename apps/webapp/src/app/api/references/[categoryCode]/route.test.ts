import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listPublicMock, stampBootstrapPrincipalMock } = vi.hoisted(() => ({
  listPublicMock: vi.fn(),
  stampBootstrapPrincipalMock: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    references: { listPublicBaselineItemsByCategoryCode: listPublicMock },
  }),
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: stampBootstrapPrincipalMock,
}));

import { GET } from './route';

describe('GET /api/references/[categoryCode]', () => {
  beforeEach(() => {
    listPublicMock.mockReset();
    stampBootstrapPrincipalMock.mockReset();
  });

  it('returns the public baseline without selecting a tenant snapshot', async () => {
    listPublicMock.mockResolvedValue([
      { id: 'i1', categoryId: 'c1', code: 'pain', title: 'Боль', sortOrder: 1 },
    ]);
    const res = await GET(new Request('http://localhost/api/references/symptom_type'), {
      params: Promise.resolve({ categoryCode: 'symptom_type' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      items: [{ id: 'i1', code: 'pain', title: 'Боль', sortOrder: 1 }],
    });
    expect(listPublicMock).toHaveBeenCalledWith('symptom_type');
    expect(stampBootstrapPrincipalMock).toHaveBeenCalledOnce();
  });

  it('never exposes the private visit manipulation catalog', async () => {
    const res = await GET(new Request('http://localhost/api/references/visit_manipulation'), {
      params: Promise.resolve({ categoryCode: 'visit_manipulation' }),
    });
    expect(res.status).toBe(404);
    expect(listPublicMock).not.toHaveBeenCalled();
  });

  it('rejects an empty category', async () => {
    const res = await GET(new Request('http://localhost/api/references/'), {
      params: Promise.resolve({ categoryCode: '' }),
    });
    expect(res.status).toBe(400);
  });
});
