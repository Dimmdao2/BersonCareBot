import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listBranchesAdminMock = vi.hoisted(() => vi.fn());
const upsertBranchMock = vi.hoisted(() => vi.fn());
const getBranchByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      listBranchesAdmin: listBranchesAdminMock,
      upsertBranch: upsertBranchMock,
      getBranchById: getBranchByIdMock,
    },
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
  });

  it("returns 403 without adminMode", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", bindings: {} },
      adminMode: false,
    });
    const res = await GET();
    expect(res.status).toBe(403);
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
