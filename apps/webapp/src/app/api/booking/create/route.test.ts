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

  it("creates in_person booking with branchServiceId + cityCode", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    createBookingMock.mockResolvedValue({ id: "b2", status: "confirmed" });
    const response = await POST(new Request("http://localhost/api/booking/create", {
      method: "POST",
      body: JSON.stringify({
        type: "in_person",
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCode: "moscow",
        slotStart: "2026-04-01T07:00:00.000Z",
        slotEnd: "2026-04-01T08:00:00.000Z",
        contactName: "Ivan",
        contactPhone: "+79990001122",
      }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "in_person",
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCode: "moscow",
      }),
    );
  });

  it("returns 400 for in_person without branchServiceId", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    const response = await POST(new Request("http://localhost/api/booking/create", {
      method: "POST",
      body: JSON.stringify({
        type: "in_person",
        cityCode: "moscow",
        slotStart: "2026-04-01T07:00:00.000Z",
        slotEnd: "2026-04-01T08:00:00.000Z",
        contactName: "Ivan",
        contactPhone: "+79990001122",
      }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when service reports city_mismatch", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    createBookingMock.mockRejectedValue(new Error("city_mismatch"));
    const response = await POST(new Request("http://localhost/api/booking/create", {
      method: "POST",
      body: JSON.stringify({
        type: "in_person",
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCode: "spb",
        slotStart: "2026-04-01T07:00:00.000Z",
        slotEnd: "2026-04-01T08:00:00.000Z",
        contactName: "Ivan",
        contactPhone: "+79990001122",
      }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("city_mismatch");
  });

  it("returns 409 slot_overlap for in_person when service throws", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client" },
    });
    createBookingMock.mockRejectedValue(new Error("slot_overlap"));
    const response = await POST(new Request("http://localhost/api/booking/create", {
      method: "POST",
      body: JSON.stringify({
        type: "in_person",
        branchServiceId: "11111111-1111-4111-8111-111111111111",
        cityCode: "moscow",
        slotStart: "2026-04-01T07:00:00.000Z",
        slotEnd: "2026-04-01T08:00:00.000Z",
        contactName: "Ivan",
        contactPhone: "+79990001122",
      }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("slot_overlap");
  });
});
