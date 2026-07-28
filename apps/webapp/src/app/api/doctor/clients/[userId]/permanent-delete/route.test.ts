import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, requireDoctorWorkspaceApiContextMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
}));

vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

import { POST } from './route';

const adminModeOk = {
  ok: true as const,
  session: {
    user: { userId: 'a1', role: 'admin' as const, displayName: 'Admin', bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

describe('POST /api/doctor/clients/[userId]/permanent-delete', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    getSessionMock.mockResolvedValue(adminModeOk);
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '10000000-0000-4000-8000-000000000001',
        session: adminModeOk.session,
      },
    });
  });

  it('fails closed for an authorized administrator', async () => {
    const res = await POST();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'account_purge_disabled' });
  });

  it('keeps the admin-mode guard in front of the disabled endpoint', async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const res = await POST();

    expect(res.status).toBe(403);
    expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
  });
});
