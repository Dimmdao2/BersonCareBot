import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientPackageId = '22222222-2222-4222-822222222222';
const patientPackageItemId = '33333333-3333-4333-833333333333';

describe('POST /api/doctor/booking-engine/patient-packages/[id]/consume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doctor-user' } } },
    });
  });

  it('refuses a direct consume while subscriptions are read-only', async () => {
    const manualConsume = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      memberships: { manualConsume },
    });

    const response = await POST(
      new Request('http://test/api/doctor/booking-engine/patient-packages/id/consume', {
        method: 'POST',
        body: JSON.stringify({ patientPackageItemId }),
      }),
      { params: Promise.resolve({ id: patientPackageId }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'commercial_read_only',
      mechanic: 'subscriptions',
    });
    expect(manualConsume).not.toHaveBeenCalled();
  });
});
