import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryOrganizationProvisioningPort } from '@/infra/repos/inMemoryOrganizationProvisioning';
import { createOrganizationProvisioningService } from '@/modules/organization-provisioning/service';

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

function request(body?: unknown): Request {
  return new Request('http://localhost/api/account/first-run/bind-specialist', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

const baseUser = {
  userId: '00000000-0000-4000-8000-000000000017',
  displayName: 'Иванов Иван',
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

    const response = await POST(request());

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

    const response = await POST(request());

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

  it('refuses to create a new specialist row from a legacy Latin account name', async () => {
    const legacyDoctorSession = {
      user: { ...baseUser, role: 'doctor', displayName: 'John Smith' },
    };
    fakes.getCurrentSession.mockResolvedValue(legacyDoctorSession);
    fakes.workspaceGate.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '00000000-0000-4000-8000-000000000118',
        membershipId: '00000000-0000-4000-8000-000000000119',
        membershipRole: 'owner',
        specialistId: null,
        session: legacyDoctorSession,
      },
    });

    const provisioningPort = createInMemoryOrganizationProvisioningPort(baseUser.userId);
    const persistSpecialist = vi
      .spyOn(provisioningPort, 'ensureOwnBookableSpecialist')
      .mockResolvedValue({
        specialistId: '00000000-0000-4000-8000-000000000120',
        created: true,
      });
    fakes.buildAppDeps.mockReturnValue({
      organizationProvisioning: createOrganizationProvisioningService({ provisioningPort }),
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'fio_latin_rejected',
    });
    expect(persistSpecialist).not.toHaveBeenCalled();
  });

  it('asks for a name instead of binding an empty saved account name', async () => {
    const blankDoctorSession = {
      user: { ...baseUser, role: 'doctor', displayName: '   ' },
    };
    fakes.getCurrentSession.mockResolvedValue(blankDoctorSession);
    fakes.workspaceGate.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '00000000-0000-4000-8000-000000000118',
        membershipId: '00000000-0000-4000-8000-000000000119',
        membershipRole: 'owner',
        specialistId: null,
        session: blankDoctorSession,
      },
    });

    const provisioningPort = createInMemoryOrganizationProvisioningPort(baseUser.userId);
    const persistSpecialist = vi.spyOn(provisioningPort, 'ensureOwnBookableSpecialist');
    fakes.buildAppDeps.mockReturnValue({
      organizationProvisioning: createOrganizationProvisioningService({ provisioningPort }),
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'fio_latin_rejected',
    });
    expect(persistSpecialist).not.toHaveBeenCalled();
  });

  it('refuses a Latin name entered after the first-run prompt', async () => {
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

    const provisioningPort = createInMemoryOrganizationProvisioningPort(baseUser.userId);
    const persistSpecialist = vi.spyOn(provisioningPort, 'ensureOwnBookableSpecialist');
    fakes.buildAppDeps.mockReturnValue({
      organizationProvisioning: createOrganizationProvisioningService({ provisioningPort }),
    });

    const response = await POST(request({ fullName: 'John Smith' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'fio_latin_rejected',
    });
    expect(persistSpecialist).not.toHaveBeenCalled();
  });

  it('creates a specialist from a Cyrillic name entered after a legacy Latin name is rejected', async () => {
    const legacyDoctorSession = {
      user: { ...baseUser, role: 'doctor', displayName: 'John Smith' },
    };
    fakes.getCurrentSession.mockResolvedValue(legacyDoctorSession);
    fakes.workspaceGate.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '00000000-0000-4000-8000-000000000118',
        membershipId: '00000000-0000-4000-8000-000000000119',
        membershipRole: 'owner',
        specialistId: null,
        session: legacyDoctorSession,
      },
    });

    const provisioningPort = createInMemoryOrganizationProvisioningPort(baseUser.userId);
    const persistSpecialist = vi
      .spyOn(provisioningPort, 'ensureOwnBookableSpecialist')
      .mockResolvedValue({
        specialistId: '00000000-0000-4000-8000-000000000120',
        created: true,
      });
    fakes.buildAppDeps.mockReturnValue({
      organizationProvisioning: createOrganizationProvisioningService({ provisioningPort }),
    });

    const response = await POST(request({ fullName: 'Иванов Иван' }));

    expect(response.status).toBe(200);
    expect(persistSpecialist).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000118',
      membershipId: '00000000-0000-4000-8000-000000000119',
      platformUserId: baseUser.userId,
      fullName: 'Иванов Иван',
    });
  });
});
