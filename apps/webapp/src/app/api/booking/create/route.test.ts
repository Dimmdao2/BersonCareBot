import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { createBooking: createBookingMock },
  }),
}));

import { POST } from "./route";

describe("POST /api/booking/create", () => {
  it("returns 401 for unauthenticated request", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/booking/create", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("creates booking on valid payload", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    createBookingMock.mockResolvedValue({ id: "b1", status: "confirmed" });
    const response = await POST(new Request("http://localhost/api/booking/create", {
      method: "POST",
      body: JSON.stringify({
        type: "online",
        category: "general",
        slotStart: "2026-04-01T07:00:00.000Z",
        slotEnd: "2026-04-01T08:00:00.000Z",
        contactName: "Ivan",
        contactPhone: "+79990001122",
      }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
