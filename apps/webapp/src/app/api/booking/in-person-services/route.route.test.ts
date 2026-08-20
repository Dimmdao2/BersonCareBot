import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const foreignBranchId = '44444444-4444-4444-8444-444444444444';

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    branchId,
    branchTitle: 'Клиника на Тверской',
    cityCode: 'moscow',
    branchSortOrder: 1,
    serviceId: '55555555-5555-4555-8555-555555555555',
    serviceTitle: 'Приём',
    serviceDescription: null,
    durationMinutes: 60,
    priceMinor: 500_000,
    serviceSortOrder: 2,
    ...overrides,
  };
}

function request(id: string): Request {
  return new Request(`https://app.test/api/booking/in-person-services?branchId=${id}`);
}

describe('GET /api/booking/in-person-services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId } },
    });
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
    fakes.withPatientOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
  });

  it('gives the patient the branch and its service list', async () => {
    const listCurrentPatientCatalog = vi.fn().mockResolvedValue([
      catalogRow({
        serviceId: '55555555-5555-4555-8555-555555555555',
        serviceTitle: 'Приём',
        serviceSortOrder: 2,
      }),
      catalogRow({
        serviceId: '66666666-6666-4666-8666-666666666666',
        serviceTitle: 'Массаж',
        serviceSortOrder: 1,
        priceMinor: 300_000,
      }),
      catalogRow({ branchId: foreignBranchId, serviceTitle: 'Чужой филиал' }),
    ]);
    fakes.buildAppDeps.mockReturnValue({
      patientBookingCatalog: { listCurrentPatientCatalog },
    });

    const response = await GET(request(branchId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      branch: { id: branchId, title: 'Клиника на Тверской', cityCode: 'moscow' },
      services: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          title: 'Массаж',
          description: null,
          durationMinutes: 60,
          priceMinor: 300_000,
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          title: 'Приём',
          description: null,
          durationMinutes: 60,
          priceMinor: 500_000,
        },
      ],
    });
  });

  it('reads the catalog only inside the organization the patient is enrolled in', async () => {
    const listCurrentPatientCatalog = vi.fn().mockResolvedValue([catalogRow()]);
    fakes.buildAppDeps.mockReturnValue({
      patientBookingCatalog: { listCurrentPatientCatalog },
    });

    await GET(request(branchId));

    expect(fakes.withPatientOrganizationPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, platformUserId: patientUserId }),
      expect.any(Function),
    );
    const principalCallOrder =
      fakes.withPatientOrganizationPrincipal.mock.invocationCallOrder[0] ?? 0;
    const catalogCallOrder = listCurrentPatientCatalog.mock.invocationCallOrder[0] ?? 0;
    expect(catalogCallOrder).toBeGreaterThan(principalCallOrder);
  });

  it('does not show a branch of an organization the patient is not enrolled in', async () => {
    const listCurrentPatientCatalog = vi.fn().mockResolvedValue([catalogRow()]);
    fakes.buildAppDeps.mockReturnValue({
      patientBookingCatalog: { listCurrentPatientCatalog },
    });

    const response = await GET(request(foreignBranchId));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'branch_not_found' });
  });

  it('passes the enrollment refusal through instead of guessing an organization', async () => {
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'organization_selection_required' }, { status: 409 }),
    });
    fakes.buildAppDeps.mockReturnValue({
      patientBookingCatalog: { listCurrentPatientCatalog: vi.fn() },
    });

    const response = await GET(request(branchId));

    expect(response.status).toBe(409);
  });
});
