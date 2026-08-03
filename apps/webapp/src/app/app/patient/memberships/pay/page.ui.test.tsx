import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  getMechanicMutationAvailability: vi.fn(),
  requireEntitlementForPage: vi.fn(),
  getOptionalPatientSession: vi.fn(),
  resolvePatientPackageOrganizationId: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: fakes.redirect }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicMutationAvailability: fakes.getMechanicMutationAvailability,
  requireEntitlementForPage: fakes.requireEntitlementForPage,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: {
      resolvePatientPackageOrganizationId: fakes.resolvePatientPackageOrganizationId,
    },
  }),
}));
vi.mock('./PatientPackagePayClient', () => ({
  PatientPackagePayClient: ({ patientPackageId }: { patientPackageId: string }) => patientPackageId,
}));

import PatientPackagePayPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientPackageId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getOptionalPatientSession.mockResolvedValue({ user: { userId: 'patient-user' } });
  fakes.resolvePatientPackageOrganizationId.mockResolvedValue(organizationId);
  fakes.requireEntitlementForPage.mockResolvedValue(undefined);
  fakes.getMechanicMutationAvailability.mockImplementation(
    async (_context: unknown, mechanic: string) => ({ available: mechanic !== 'payments' }),
  );
});

describe('PatientPackagePayPage', () => {
  it('redirects instead of opening checkout when payments are unavailable', async () => {
    await expect(
      PatientPackagePayPage({ searchParams: Promise.resolve({ patientPackageId }) }),
    ).rejects.toThrow('REDIRECT:/app/patient/booking');
  });

  it('opens checkout only when both subscriptions and payments allow mutations', async () => {
    fakes.getMechanicMutationAvailability.mockResolvedValue({ available: true });

    const result = await PatientPackagePayPage({
      searchParams: Promise.resolve({ patientPackageId }),
    });

    expect(result.props.patientPackageId).toBe(patientPackageId);
  });
});
