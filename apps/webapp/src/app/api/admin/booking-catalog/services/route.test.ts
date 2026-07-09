import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listServicesAdminMock = vi.hoisted(() => vi.fn());
const upsertServiceMock = vi.hoisted(() => vi.fn());
const getServiceByIdMock = vi.hoisted(() => vi.fn());
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

  it("returns 200 for admin", async () => {
    getSessionMock.mockResolvedValue(adminSession);
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

  it("returns 400 on invalid body", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid upsert", async () => {
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
    expect(res.status).toBe(200);
    expect(upsertServiceMock).toHaveBeenCalledWith({
      title: "Услуга",
      description: null,
      durationMinutes: 60,
      breakAfterMinutes: 15,
      priceMinor: 100,
      isActive: true,
      sortOrder: 0,
    });
  });

  it("returns 400 when breakAfterMinutes is not a 5-minute step", async () => {
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
    expect(res.status).toBe(400);
  });

  it("returns 409 unique_violation on database conflict", async () => {
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
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "unique_violation" });
  });
});
