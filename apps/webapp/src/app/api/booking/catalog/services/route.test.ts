import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingCatalog: { listServicesByCity: listServicesMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/booking/catalog/services", () => {
  it("returns 400 without cityCode", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client" } });
    const res = await GET(new Request("http://localhost/api/booking/catalog/services"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when city_not_found", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client" } });
    listServicesMock.mockRejectedValue(new Error("city_not_found"));
    const res = await GET(new Request("http://localhost/api/booking/catalog/services?cityCode=unknown"));
    expect(res.status).toBe(404);
  });
});
