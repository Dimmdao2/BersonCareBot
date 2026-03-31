import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const listMyBookingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { listMyBookings: listMyBookingsMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/booking/my", () => {
  it("returns my booking collections", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    listMyBookingsMock.mockResolvedValue({ upcoming: [], history: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, upcoming: [], history: [] });
  });
});
