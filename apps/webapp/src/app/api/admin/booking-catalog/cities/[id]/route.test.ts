import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getCityByIdMock = vi.hoisted(() => vi.fn());
const updateCityByIdMock = vi.hoisted(() => vi.fn());
const deactivateCityMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    bookingCatalogPort: {
      getCityById: getCityByIdMock,
      updateCityById: updateCityByIdMock,
      deactivateCity: deactivateCityMock,
    },
  })),
}));

import { DELETE, GET, PATCH } from "./route";

const adminSession = {
  user: { userId: "a1", role: "admin" as const, bindings: {} },
  adminMode: true,
};

const testCityId = "550e8400-e29b-41d4-a716-446655440001";

const city = {
  id: testCityId,
  code: "moscow",
  title: "Москва",
  isActive: true,
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
};

describe("cities/[id] route", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getCityByIdMock.mockReset();
    updateCityByIdMock.mockReset();
    deactivateCityMock.mockReset();
  });

  it("GET returns 400 for invalid id", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET returns 404 when missing", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    getCityByIdMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(404);
  });

  it("GET returns city", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    getCityByIdMock.mockResolvedValue(city);
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH validates body", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ id: testCityId }) },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE soft-deactivates", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    deactivateCityMock.mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: testCityId }),
    });
    expect(res.status).toBe(200);
    expect(deactivateCityMock).toHaveBeenCalledWith(testCityId);
  });
});
