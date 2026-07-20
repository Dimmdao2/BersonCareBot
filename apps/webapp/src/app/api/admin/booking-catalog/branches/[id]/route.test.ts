import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getBranchByIdMock = vi.hoisted(() => vi.fn());
const updateBranchByIdMock = vi.hoisted(() => vi.fn());
const deactivateBranchMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    context: {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      membershipId: "membership-1",
      role: "owner",
      specialistId: null,
      canManageOrganization: true,
      canManageAllSpecialists: true,
    },
  })),
);

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      getBranchById: getBranchByIdMock,
      updateBranchById: updateBranchByIdMock,
      deactivateBranch: deactivateBranchMock,
    },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
}));

import { PATCH } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("PATCH /api/admin/booking-catalog/branches/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateBranchByIdMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("keeps global branch mutation fail-closed before database handling", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const pgErr = Object.assign(new Error("fk"), { code: "23503" });
    updateBranchByIdMock.mockRejectedValue(pgErr);
    const res = await PATCH(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: "550e8400-e29b-41d4-a716-446655440001" }),
      }),
      { params: Promise.resolve({ id: uuid }) },
    );
    expect(res.status).toBe(403);
    expect(updateBranchByIdMock).not.toHaveBeenCalled();
  });
});
