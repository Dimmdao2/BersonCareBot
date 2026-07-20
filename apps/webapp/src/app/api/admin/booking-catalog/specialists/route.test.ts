import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listSpecialistsAdminMock = vi.hoisted(() => vi.fn());
const upsertSpecialistMock = vi.hoisted(() => vi.fn());
const getSpecialistByIdMock = vi.hoisted(() => vi.fn());
const resolveOrganizationForUserMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    context: {
      organizationId: "a0000000-0000-4000-8000-000000000001",
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
      listSpecialistsAdmin: listSpecialistsAdminMock,
      upsertSpecialist: upsertSpecialistMock,
      getSpecialistById: getSpecialistByIdMock,
    },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
}));

import { GET, POST } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const clinicOwnerSession = {
  user: { userId: "owner-1", role: "doctor" as const, bindings: {} },
};

describe("GET /api/admin/booking-catalog/specialists", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listSpecialistsAdminMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/"));
    expect(res.status).toBe(401);
  });

  it("returns 200 and passes branchId filter", async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
    listSpecialistsAdminMock.mockResolvedValue([]);
    const bid = "550e8400-e29b-41d4-a716-446655440000";
    const res = await GET(new Request(`http://localhost/?branchId=${bid}`));
    expect(res.status).toBe(200);
    expect(listSpecialistsAdminMock).toHaveBeenCalledWith(bid);
  });
});

describe("POST /api/admin/booking-catalog/specialists", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    upsertSpecialistMock.mockReset();
    getSpecialistByIdMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("keeps global specialist mutations fail-closed until U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertSpecialistMock.mockRejectedValue(new Error("branch_not_found:x"));
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubitimeBranchId: "b1",
          fullName: "Иван",
          rubitimeCooperatorId: "c1",
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(upsertSpecialistMock).not.toHaveBeenCalled();
  });
});
