import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const getDefaultOrganizationIdMock = vi.hoisted(() => vi.fn());
const bookingEngineMock = vi.hoisted(() => ({
  organization: {
    getDefaultOrganizationId: getDefaultOrganizationIdMock,
  },
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    bookingEngine: bookingEngineMock,
  })),
}));

import { requireDoctorBookingEngine } from './_requireDoctorBookingEngine';

beforeEach(() => {
  requireDoctorWorkspaceApiContextMock.mockReset();
  getDefaultOrganizationIdMock.mockReset();
});

describe('requireDoctorBookingEngine', () => {
  it('returns workspace organization context without default organization fallback', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: {
        session: {
          user: { userId: 'doctor-1', role: 'doctor', displayName: 'Doctor', bindings: {} },
        },
        organizationId: 'org-from-membership',
        membershipId: 'membership-1',
        membershipRole: 'doctor',
        specialistId: 'specialist-1',
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    const gate = await requireDoctorBookingEngine();

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.ctx.organizationId).toBe('org-from-membership');
    expect(gate.ctx.specialistId).toBe('specialist-1');
    expect(gate.ctx.service).toBe(bookingEngineMock);
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
  });

  it('returns workspace gate failure before loading service', async () => {
    const response = Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({ ok: false, response });

    const gate = await requireDoctorBookingEngine();

    expect(gate).toEqual({ ok: false, response });
  });
});
