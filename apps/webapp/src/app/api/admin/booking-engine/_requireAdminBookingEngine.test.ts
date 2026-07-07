import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const getDefaultOrganizationIdMock = vi.hoisted(() => vi.fn());
const bookingEngineMock = vi.hoisted(() => ({
  organization: {
    getDefaultOrganizationId: getDefaultOrganizationIdMock,
  },
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingEngine: bookingEngineMock,
  })),
}));

import { requireAdminBookingEngine } from "./_requireAdminBookingEngine";

beforeEach(() => {
  getCurrentSessionMock.mockReset();
  requireDoctorWorkspaceApiContextMock.mockReset();
  getDefaultOrganizationIdMock.mockReset();
});

describe("requireAdminBookingEngine", () => {
  it("keeps adminMode requirement before workspace resolution", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "admin-1", role: "admin", displayName: "Admin", bindings: {} },
      issuedAt: 1,
      expiresAt: 9e9,
      adminMode: false,
    });

    const gate = await requireAdminBookingEngine();

    expect(gate.ok).toBe(false);
    expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
  });

  it("returns workspace organization context without default organization fallback", async () => {
    const session = {
      user: { userId: "admin-1", role: "admin", displayName: "Admin", bindings: {} },
      issuedAt: 1,
      expiresAt: 9e9,
      adminMode: true,
    };
    getCurrentSessionMock.mockResolvedValueOnce(session);
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: {
        session,
        organizationId: "org-from-membership",
        membershipId: "membership-1",
        membershipRole: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    });

    const gate = await requireAdminBookingEngine();

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.ctx.organizationId).toBe("org-from-membership");
    expect(gate.ctx.membershipRole).toBe("admin");
    expect(gate.ctx.service).toBe(bookingEngineMock);
    expect(getDefaultOrganizationIdMock).not.toHaveBeenCalled();
  });
});
