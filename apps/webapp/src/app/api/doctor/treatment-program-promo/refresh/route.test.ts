import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireDoctorWorkspaceApiContextMock, refreshMock, buildAppDepsMock } = vi.hoisted(() => {
  const refreshMockInner = vi.fn();
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    refreshMock: refreshMockInner,
    buildAppDepsMock: vi.fn(() => ({})),
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock('@/app-layer/treatment-program/refreshDefaultPromoPrograms', () => ({
  refreshDefaultPromoPrograms: refreshMock,
}));

import { POST } from './route';

const TEMPLATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('POST /api/doctor/treatment-program-promo/refresh', () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '10000000-0000-4000-8000-000000000001',
        session: { user: { userId: 'd1' } },
      },
    });
    refreshMock.mockReset();
  });

  it('returns 401 when no session', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 401 }),
    });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 for client role', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('returns refreshed count for doctor', async () => {
    refreshMock.mockResolvedValue({ templateId: TEMPLATE_ID, refreshedCount: 3, pairs: [] });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, templateId: TEMPLATE_ID, refreshedCount: 3 });
    expect(refreshMock).toHaveBeenCalledWith(
      expect.anything(),
      'd1',
      '10000000-0000-4000-8000-000000000001',
    );
  });

  it('returns 400 when promo is not configured', async () => {
    refreshMock.mockRejectedValue(new Error('Промо-программа не настроена'));
    const res = await POST();
    expect(res.status).toBe(400);
  });
});
