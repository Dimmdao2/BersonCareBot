import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { routePaths } from "@/app-layer/routes/paths";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const previewCancelMock = vi.hoisted(() => vi.fn());
const previewRescheduleMock = vi.hoisted(() => vi.fn());
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
    patientBooking: {
      previewCancel: previewCancelMock,
      previewReschedule: previewRescheduleMock,
    },
  }),
}));

import { GET } from "./route";

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

describe("GET /api/booking/actions", () => {
  it("returns 400 when bookingId is missing", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    const response = await GET(new Request("http://localhost/api/booking/actions"));
    expect(response.status).toBe(400);
  });

  it("returns cancel and reschedule previews", async () => {
    getCurrentSessionMock.mockResolvedValue(patientClientSession);
    previewCancelMock.mockResolvedValue({ ok: true, allowed: true, isFree: true, messageKey: "cancel_free" });
    previewRescheduleMock.mockResolvedValue({
      ok: true,
      allowed: true,
      messageKey: "reschedule_allowed",
      remainingSelfReschedules: 1,
    });
    const response = await GET(
      new Request("http://localhost/api/booking/actions?bookingId=2f14566f-a4de-4ab4-9336-5ddf806cd6ce"),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      ok: boolean;
      cancel: { allowed: boolean };
      reschedule: { allowed: boolean };
    };
    expect(json.ok).toBe(true);
    expect(json.cancel.allowed).toBe(true);
    expect(json.reschedule.allowed).toBe(true);
  });
});
