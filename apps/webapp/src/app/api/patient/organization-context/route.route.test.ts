import { beforeEach, describe, expect, it, vi } from 'vitest';

const PATIENT_ID = '00000000-0000-4000-8000-0000000005a0';
const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000005b0';

const fakes = vi.hoisted(() => ({
  requirePatientApiBusinessAccess: vi.fn(),
  resolvePatientOrganizationRequestContext: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientOrganization: {} }),
}));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  resolvePatientOrganizationRequestContext: fakes.resolvePatientOrganizationRequestContext,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: fakes.cookieGet,
    delete: fakes.cookieDelete,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.cookieGet.mockReturnValue(undefined);
  fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
    ok: true,
    organizationId: ORGANIZATION_ID,
    organization: { organizationId: ORGANIZATION_ID, title: 'Clinic' },
    organizations: [{ organizationId: ORGANIZATION_ID, title: 'Clinic' }],
  });
});

describe('patient organization context email boundary', () => {
  it('refuses organization data when the fourteen-day email deadline has passed', async () => {
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: 'patient_email_required',
          redirectTo: '/app/patient/bind-email?next=%2Fapp%2Fpatient',
        },
        { status: 403 },
      ),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'patient_email_required',
      redirectTo: '/app/patient/bind-email?next=%2Fapp%2Fpatient',
    });
    expect(fakes.resolvePatientOrganizationRequestContext).not.toHaveBeenCalled();
  });

  it('returns organization data during the soft email request period', async () => {
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: PATIENT_ID } },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      context: { ok: true, organizationId: ORGANIZATION_ID },
    });
    expect(fakes.resolvePatientOrganizationRequestContext).toHaveBeenCalledWith(
      expect.anything(),
      PATIENT_ID,
    );
  });
});
