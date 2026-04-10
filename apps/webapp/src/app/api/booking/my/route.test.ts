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

const patientClientSession = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

describe("GET /api/booking/my", () => {
  it("returns 403 patient_activation_required for client without phone (same gate as /api/patient/*)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client" } });
    const response = await GET();
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string; redirectTo?: string };
    expect(body.error).toBe("patient_activation_required");
    expect(body.redirectTo).toContain("/app/patient/bind-phone");
  });

  it("returns my booking collections", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    listMyBookingsMock.mockResolvedValue({ upcoming: [], history: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, upcoming: [], history: [] });
  });
});
