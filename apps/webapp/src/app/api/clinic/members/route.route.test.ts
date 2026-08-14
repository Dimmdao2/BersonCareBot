import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = 'platform-user-1';

describe('GET /api/clinic/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: platformUserId } } },
    });
  });

  it('refuses team members when the clinic team is disabled', async () => {
    const listOrganizationMembers = vi.fn();
    const getSeatStatus = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
      organizationMembership: { listOrganizationMembers },
      clinicSeats: { getSeatStatus },
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listOrganizationMembers).not.toHaveBeenCalled();
    expect(getSeatStatus).not.toHaveBeenCalled();
  });

  it('keeps team members readable when the clinic team is read-only', async () => {
    const listOrganizationMembers = vi.fn().mockResolvedValue([
      {
        id: 'member-1',
        displayName: 'Doctor',
        role: 'doctor',
        status: 'active',
        specialistId: '22222222-2222-4222-8222-222222222222',
      },
    ]);
    const getSeatStatus = vi.fn().mockResolvedValue({ used: 1 });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      organizationMembership: { listOrganizationMembers },
      clinicSeats: { getSeatStatus },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      members: [{ id: 'member-1', canManageOrganization: false, seatConsuming: true }],
      seats: { used: 1 },
    });
    expect(listOrganizationMembers).toHaveBeenCalledWith(organizationId);
    expect(getSeatStatus).toHaveBeenCalledWith(organizationId, platformUserId);
  });
});
