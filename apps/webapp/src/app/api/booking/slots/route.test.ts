import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getSlotsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { getSlots: getSlotsMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/booking/slots", () => {
  it("returns 401 for unauthenticated request", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/booking/slots?type=online&category=general"));
    expect(response.status).toBe(401);
  });

  it("returns slots for valid query", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    getSlotsMock.mockResolvedValue([{ date: "2026-04-01", slots: [{ startAt: "2026-04-01T10:00:00+03:00", endAt: "2026-04-01T11:00:00+03:00" }] }]);
    const response = await GET(new Request("http://localhost/api/booking/slots?type=online&category=general"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, slots: expect.any(Array) });
  });

  it("returns 404 when branch_service_not_found for in_person", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    getSlotsMock.mockRejectedValue(new Error("branch_service_not_found"));
    const response = await GET(
      new Request(
        "http://localhost/api/booking/slots?type=in_person&branchServiceId=11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("branch_service_not_found");
  });
});
