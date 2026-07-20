import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listBranchServicesAdminMock = vi.hoisted(() => vi.fn());
const upsertBranchServiceAdminMock = vi.hoisted(() => vi.fn());
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
      listBranchServicesAdmin: listBranchServicesAdminMock,
      upsertBranchServiceAdmin: upsertBranchServiceAdminMock,
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

const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("branch-services route", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listBranchServicesAdminMock.mockReset();
    upsertBranchServiceAdminMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("GET filters by branchId query", async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
    listBranchServicesAdminMock.mockResolvedValue([]);
    const res = await GET(
      new Request(`http://localhost/api?branchId=${uuid}`),
    );
    expect(res.status).toBe(200);
    expect(listBranchServicesAdminMock).toHaveBeenCalledWith(uuid);
  });

  it("POST remains fail-closed before port validation", async () => {
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
    expect(res.status).toBe(403);
    expect(upsertBranchServiceAdminMock).not.toHaveBeenCalled();
  });

  it("POST keeps global branch-service mutation closed until U9", async () => {
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
    expect(res.status).toBe(403);
    expect(upsertBranchServiceAdminMock).not.toHaveBeenCalled();
  });

  it("POST retries remain fail-closed and do not call the port", async () => {
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
    expect((await req()).status).toBe(403);
    expect((await req()).status).toBe(403);
    expect(upsertBranchServiceAdminMock).not.toHaveBeenCalled();
  });

  it("GET returns inactive branch-service rows to the legacy organization owner", async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
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
