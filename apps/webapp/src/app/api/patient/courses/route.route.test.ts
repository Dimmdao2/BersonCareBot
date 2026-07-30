import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-822222222222';

describe('GET /api/patient/courses', () => {
  it('hides the assigned course list when the clinic disabled courses', async () => {
    const listAssignedForPatient = vi.fn();
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId } },
    });
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'courses',
          state: 'disabled',
          policySource: 'system',
          warning: null,
        }),
      },
      courses: { listAssignedForPatient },
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'entitlement_required',
      mechanic: 'courses',
    });
    expect(listAssignedForPatient).not.toHaveBeenCalled();
  });

  it('keeps the assigned course list readable when the clinic is read-only', async () => {
    const listAssignedForPatient = vi.fn().mockResolvedValue([{ id: 'course-1' }]);
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId } },
    });
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
    fakes.withPatientOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'courses',
          state: 'read_only',
          policySource: 'system',
          warning: null,
        }),
      },
      courses: { listAssignedForPatient },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, items: [{ id: 'course-1' }] });
    expect(listAssignedForPatient).toHaveBeenCalledWith(patientUserId);
  });
});
