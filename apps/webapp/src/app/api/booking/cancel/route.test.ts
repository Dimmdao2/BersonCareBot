import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const cancelBookingMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { cancelBooking: cancelBookingMock },
  }),
}));

import { POST } from "./route";

const patientClientSession = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

describe("POST /api/booking/cancel", () => {
  it("returns 404 when booking is not found", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    cancelBookingMock.mockResolvedValue({ ok: false, error: "not_found" });
    const response = await POST(new Request("http://localhost/api/booking/cancel", {
      method: "POST",
      body: JSON.stringify({ bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(404);
  });

  it("returns ok on successful cancellation", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    cancelBookingMock.mockResolvedValue({ ok: true });
    const response = await POST(new Request("http://localhost/api/booking/cancel", {
      method: "POST",
      body: JSON.stringify({ bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce", reason: "busy" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
  });
});
