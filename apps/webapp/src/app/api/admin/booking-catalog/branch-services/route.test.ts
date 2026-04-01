import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listBranchServicesAdminMock = vi.hoisted(() => vi.fn());
const upsertBranchServiceAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      listBranchServicesAdmin: listBranchServicesAdminMock,
      upsertBranchServiceAdmin: upsertBranchServiceAdminMock,
    },
  })),
}));

import { GET, POST } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("branch-services route", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listBranchServicesAdminMock.mockReset();
    upsertBranchServiceAdminMock.mockReset();
  });

  it("GET filters by branchId query", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    listBranchServicesAdminMock.mockResolvedValue([]);
    const res = await GET(
      new Request(`http://localhost/api?branchId=${uuid}`),
    );
    expect(res.status).toBe(200);
    expect(listBranchServicesAdminMock).toHaveBeenCalledWith(uuid);
  });

  it("POST returns 400 on specialist_branch_mismatch", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertBranchServiceAdminMock.mockRejectedValue(new Error("specialist_branch_mismatch"));
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: uuid,
          serviceId: uuid,
          specialistId: uuid,
          rubitimeServiceId: "svc-1",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("specialist_branch_mismatch");
  });

  it("POST returns 200 on upsert", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertBranchServiceAdminMock.mockResolvedValue({
      id: uuid,
      branchId: uuid,
      serviceId: uuid,
      specialistId: uuid,
      rubitimeServiceId: "r1",
      isActive: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
    });
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: uuid,
          serviceId: uuid,
          specialistId: uuid,
          rubitimeServiceId: "r1",
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("POST twice with same branch+service resolves as upsert (200 both)", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const row = {
      id: uuid,
      branchId: uuid,
      serviceId: uuid,
      specialistId: uuid,
      rubitimeServiceId: "r1",
      isActive: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
    };
    upsertBranchServiceAdminMock.mockResolvedValue(row);
    const body = {
      branchId: uuid,
      serviceId: uuid,
      specialistId: uuid,
      rubitimeServiceId: "r1",
    };
    const req = () =>
      POST(
        new Request("http://localhost/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    expect(upsertBranchServiceAdminMock).toHaveBeenCalledTimes(2);
  });

  it("GET returns inactive branch-service rows for admin list", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    listBranchServicesAdminMock.mockResolvedValue([
      {
        id: uuid,
        branchId: uuid,
        serviceId: uuid,
        specialistId: uuid,
        rubitimeServiceId: "r1",
        isActive: false,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const res = await GET(new Request("http://localhost/api"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { branchServices: { isActive: boolean }[] };
    expect(json.branchServices[0]?.isActive).toBe(false);
  });
});
