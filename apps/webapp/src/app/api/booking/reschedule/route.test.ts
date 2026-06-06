import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { routePaths } from "@/app-layer/routes/paths";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const rescheduleBookingMock = vi.hoisted(() => vi.fn());
const requirePatientBookingTrustedPhoneAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/guards/requireRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/guards/requireRole")>();
  return {
    ...actual,
    requirePatientBookingTrustedPhoneAccess: requirePatientBookingTrustedPhoneAccessMock,
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { rescheduleBooking: rescheduleBookingMock },
  }),
}));

import { POST } from "./route";

const patientClientSession = { user: { userId: "u1", role: "client" as const, phone: "+79990001122" } };

requirePatientBookingTrustedPhoneAccessMock.mockImplementation(async (options?: { returnPath?: string }) => {
  const session = await getCurrentSessionMock();
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  const ret = options?.returnPath ?? routePaths.patientBooking;
  if (session.user.role === "client" && !session.user.phone?.trim()) {
    const next = encodeURIComponent(ret);
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "patient_activation_required",
          redirectTo: `${routePaths.bindPhone}?next=${next}`,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, session };
});

describe("POST /api/booking/reschedule", () => {
  it("returns 409 on slot_overlap", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    rescheduleBookingMock.mockResolvedValue({ ok: false, error: "slot_overlap" });
    const response = await POST(
      new Request("http://localhost/api/booking/reschedule", {
        method: "POST",
        body: JSON.stringify({
          bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(409);
  });

  it("returns ok on successful reschedule", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    rescheduleBookingMock.mockResolvedValue({ ok: true, booking: { id: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce" } });
    const response = await POST(
      new Request("http://localhost/api/booking/reschedule", {
        method: "POST",
        body: JSON.stringify({
          bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 400 when booking has no canonical appointment", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    rescheduleBookingMock.mockResolvedValue({ ok: false, error: "no_canonical" });
    const response = await POST(
      new Request("http://localhost/api/booking/reschedule", {
        method: "POST",
        body: JSON.stringify({
          bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns partial failure flags from service on successful reschedule", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    rescheduleBookingMock.mockResolvedValue({
      ok: true,
      booking: { id: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce" },
      rubitimeMirrorFailed: true,
      notificationOutcomeFailed: true,
      paymentOutcomeFailed: true,
    });
    const response = await POST(
      new Request("http://localhost/api/booking/reschedule", {
        method: "POST",
        body: JSON.stringify({
          bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce",
          slotStart: "2026-06-01T10:00:00.000Z",
          slotEnd: "2026-06-01T11:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.rubitimeMirrorFailed).toBe(true);
    expect(json.notificationOutcomeFailed).toBe(true);
    expect(json.paymentOutcomeFailed).toBe(true);
  });
});
