import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  workspaceGate: vi.fn(),
  ensureOwnBookableSpecialist: vi.fn(),
  buildAppDeps: vi.fn(),
}));

vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAdminWorkspaceApiContext: fakes.workspaceGate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import { POST } from './route';

const baseUser = {
  userId: '00000000-0000-4000-8000-000000000017',
  displayName: 'Staff user',
  bindings: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.buildAppDeps.mockReturnValue({
    organizationProvisioning: {
      ensureOwnBookableSpecialist: fakes.ensureOwnBookableSpecialist,
    },
  });
});

describe('first-run specialist self-binding boundary', () => {
  it('refuses a global-admin capability before membership resolution or provisioning', async () => {
    fakes.getCurrentSession.mockResolvedValue({ user: { ...baseUser, role: 'admin' } });

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'platform_admin_forbidden',
    });
    expect(fakes.workspaceGate).not.toHaveBeenCalled();
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.ensureOwnBookableSpecialist).not.toHaveBeenCalled();
  });

  it('keeps an eligible clinic owner on the existing provisioning path', async () => {
    const doctorSession = { user: { ...baseUser, role: 'doctor' } };
    fakes.getCurrentSession.mockResolvedValue(doctorSession);
    fakes.workspaceGate.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '00000000-0000-4000-8000-000000000118',
        membershipId: '00000000-0000-4000-8000-000000000119',
        membershipRole: 'owner',
        specialistId: null,
        session: doctorSession,
      },
    });
    fakes.ensureOwnBookableSpecialist.mockResolvedValue('00000000-0000-4000-8000-000000000120');

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      specialistId: '00000000-0000-4000-8000-000000000120',
    });
    expect(fakes.ensureOwnBookableSpecialist).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000118',
      membershipId: '00000000-0000-4000-8000-000000000119',
      platformUserId: baseUser.userId,
      membershipRole: 'owner',
      specialistId: null,
      displayName: baseUser.displayName,
    });
  });
});
