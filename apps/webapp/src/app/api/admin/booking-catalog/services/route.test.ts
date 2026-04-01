import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listServicesAdminMock = vi.hoisted(() => vi.fn());
const upsertServiceMock = vi.hoisted(() => vi.fn());
const getServiceByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      listServicesAdmin: listServicesAdminMock,
      upsertService: upsertServiceMock,
      getServiceById: getServiceByIdMock,
    },
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
          priceMinor: 100,
        }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
