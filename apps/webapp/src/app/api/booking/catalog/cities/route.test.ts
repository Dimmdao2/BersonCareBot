import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const listCitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingCatalog: { listCitiesForPatient: listCitiesMock },
  }),
}));

import { GET } from "./route";

const patientClientSession = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

describe("GET /api/booking/catalog/cities", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns cities when catalog available", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    listCitiesMock.mockResolvedValue([{ id: "c1", code: "moscow", title: "Москва", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cities).toHaveLength(1);
  });
});
