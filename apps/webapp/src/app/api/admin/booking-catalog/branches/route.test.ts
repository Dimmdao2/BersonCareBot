import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listBranchesAdminMock = vi.hoisted(() => vi.fn());
const upsertBranchMock = vi.hoisted(() => vi.fn());
const getBranchByIdMock = vi.hoisted(() => vi.fn());
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
      listBranchesAdmin: listBranchesAdminMock,
      upsertBranch: upsertBranchMock,
      getBranchById: getBranchByIdMock,
    },
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
  })),
}));

import { GET, POST } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("GET /api/admin/booking-catalog/branches", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listBranchesAdminMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("allows a management-capable membership to read reference branches", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "owner-1", role: "doctor", bindings: {} },
    });
    listBranchesAdminMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns branches for admin", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    listBranchesAdminMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/booking-catalog/branches", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    upsertBranchMock.mockReset();
    getBranchByIdMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("returns 400 when city missing", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubitimeBranchId: "1", title: "X" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when city_not_found", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertBranchMock.mockRejectedValue(new Error("city_not_found:zzz"));
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityCode: "zzz",
          title: "Филиал",
          rubitimeBranchId: "br1",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
