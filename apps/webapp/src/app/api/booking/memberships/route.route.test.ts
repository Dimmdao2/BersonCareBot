import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('../bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-822222222222';

describe('GET /api/booking/memberships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId } },
    });
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
  });

  it('keeps already purchased package history readable after subscriptions are disabled', async () => {
    const listPatientPackagesForUser = vi.fn().mockResolvedValue([{ id: 'package-1' }]);
    fakes.withExplicitOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
      memberships: { listPatientPackagesForUser },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, packages: [{ id: 'package-1' }] });
    expect(listPatientPackagesForUser).toHaveBeenCalledWith(patientUserId, organizationId);
  });

  it('keeps existing package history readable for a read-only patient', async () => {
    const listPatientPackagesForUser = vi.fn().mockResolvedValue([{ id: 'package-1' }]);
    fakes.withExplicitOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      memberships: { listPatientPackagesForUser },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, packages: [{ id: 'package-1' }] });
    expect(listPatientPackagesForUser).toHaveBeenCalledWith(patientUserId, organizationId);
  });
});
