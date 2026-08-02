import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientPackageId = '22222222-2222-4222-822222222222';
const patientPackageItemId = '33333333-3333-4333-8333-333333333333';

describe('POST /api/doctor/booking-engine/patient-packages/[id]/consume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doctor-user' } } },
    });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
  });

  it.each(['disabled', 'read_only'] as const)(
    'keeps an already purchased package consumable while subscriptions are %s',
    async (state) => {
    const manualConsume = vi.fn().mockResolvedValue({ id: 'usage-1' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state, warning: null }) },
      memberships: { manualConsume },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages/id/consume', {
        method: 'POST',
        body: JSON.stringify({ patientPackageItemId }),
      }),
      { params: Promise.resolve({ id: patientPackageId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, usage: { id: 'usage-1' } });
    expect(manualConsume).toHaveBeenCalledWith(
      {
        organizationId,
        patientPackageId,
        patientPackageItemId,
        appointmentId: null,
        createdByPlatformUserId: 'doctor-user',
      },
      expect.objectContaining({ runMembershipWrite: expect.any(Function) }),
    );
    },
  );
});
