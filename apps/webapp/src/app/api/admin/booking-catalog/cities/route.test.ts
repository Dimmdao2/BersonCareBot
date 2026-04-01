import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const listCitiesAdminMock = vi.hoisted(() => vi.fn());
const upsertCityMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      listCitiesAdmin: listCitiesAdminMock,
      upsertCity: upsertCityMock,
    },
  })),
}));

import { GET, POST } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("GET /api/admin/booking-catalog/cities", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listCitiesAdminMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 without adminMode", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "a1", role: "admin", bindings: {} },
      adminMode: false,
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
      adminMode: true,
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 and cities for admin+adminMode", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    listCitiesAdminMock.mockResolvedValue([
      {
        id: "c1",
        code: "moscow",
        title: "Москва",
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; cities: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.cities).toHaveLength(1);
  });
});

describe("POST /api/admin/booking-catalog/cities", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    upsertCityMock.mockReset();
  });

  it("returns 400 on invalid body", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await POST(
      new Request("http://localhost/api/admin/booking-catalog/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid upsert", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    upsertCityMock.mockResolvedValue({
      id: "c1",
      code: "moscow",
      title: "Москва",
      isActive: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
    });
    const res = await POST(
      new Request("http://localhost/api/admin/booking-catalog/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "Moscow", title: "Москва", sortOrder: 1 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; city: { code: string } };
    expect(body.ok).toBe(true);
    expect(body.city.code).toBe("moscow");
    expect(upsertCityMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "moscow", title: "Москва" }),
    );
  });
});
