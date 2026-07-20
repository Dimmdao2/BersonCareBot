import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listServicesAdminMock = vi.hoisted(() => vi.fn());
const upsertServiceMock = vi.hoisted(() => vi.fn());
const getServiceByIdMock = vi.hoisted(() => vi.fn());
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
      listServicesAdmin: listServicesAdminMock,
      upsertService: upsertServiceMock,
      getServiceById: getServiceByIdMock,
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

describe("GET /api/admin/booking-catalog/services", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listServicesAdminMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns reference services for the legacy organization owner", async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
    listServicesAdminMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/booking-catalog/services", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    upsertServiceMock.mockReset();
    getServiceByIdMock.mockReset();
    resolveOrganizationForUserMock.mockClear();
  });

  it("checks the global governance boundary before validating input", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(upsertServiceMock).not.toHaveBeenCalled();
  });

  it("keeps global service mutation fail-closed until U9", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertServiceMock.mockResolvedValue({ id: "svc-1" });
    getServiceByIdMock.mockResolvedValue({
      id: "svc-1",
      title: "Услуга",
      description: null,
      durationMinutes: 60,
      priceMinor: 100,
      breakAfterMinutes: 15,
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
          title: "Услуга",
          durationMinutes: 60,
          breakAfterMinutes: 15,
          priceMinor: 100,
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(upsertServiceMock).not.toHaveBeenCalled();
  });

  it("does not expose validation details before the platform boundary", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Услуга",
          durationMinutes: 60,
          breakAfterMinutes: 7,
          priceMinor: 100,
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("does not reach database conflict handling before U9 governance", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertServiceMock.mockRejectedValue({ code: "23505" });
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Услуга",
          durationMinutes: 60,
          priceMinor: 100,
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(upsertServiceMock).not.toHaveBeenCalled();
  });
});
