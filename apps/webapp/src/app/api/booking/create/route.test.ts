import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { routePaths } from "@/app-layer/routes/paths";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const requirePatientBookingTrustedPhoneAccessMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());

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
    patientBooking: { createBooking: createBookingMock },
    bookingEngine: {
      organization: { getDefaultOrganizationId: async () => "org-1" },
      catalog: { listSpecialists: async () => [{ id: "sp-1", isActive: true }] },
    },
    bookingScheduling: {
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
  }),
}));

import { POST } from "./route";

/** Без `DATABASE_URL` в тестах gate опирается на телефон в сессии (`patientClientBusinessGate`). */
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
          message: "Требуется подтверждённый профиль пациента",
          redirectTo: `${routePaths.bindPhone}?next=${next}`,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, session };
});

describe("POST /api/booking/create", () => {
  it("returns 401 for unauthenticated request", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/booking/create", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 patient_activation_required for client without phone (patient business gate)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client" } });
    const response = await POST(
      new Request("http://localhost/api/booking/create", {
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
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("patient_activation_required");
  });

  it("creates booking on valid payload", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
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
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
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

  it("creates in_person booking with branchId+serviceId", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    resolveLegacyBranchServiceIdMock.mockResolvedValue("bs-canonical");
    createBookingMock.mockResolvedValue({ id: "b3", status: "confirmed" });
    const response = await POST(
      new Request("http://localhost/api/booking/create", {
        method: "POST",
        body: JSON.stringify({
          type: "in_person",
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          cityCode: "moscow",
          slotStart: "2026-04-01T07:00:00.000Z",
          slotEnd: "2026-04-01T08:00:00.000Z",
          contactName: "Ivan",
          contactPhone: "+79990001122",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "in_person",
        branchServiceId: "bs-canonical",
        cityCode: "moscow",
      }),
    );
  });

  it("returns 400 for in_person without branchServiceId or branchId+serviceId", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
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
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
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
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
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

  it("returns 503 rubitime_projection_not_ready when projection is not ready", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    createBookingMock.mockRejectedValue(new Error("rubitime_projection_not_ready"));
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
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("rubitime_projection_not_ready");
  });
});
