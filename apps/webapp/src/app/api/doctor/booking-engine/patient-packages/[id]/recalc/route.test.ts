import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const recalcPastSessionsForPackageMock = vi.hoisted(() => vi.fn());
const getAppointmentMock = vi.hoisted(() => vi.fn());
const emitPackageLinkedCalendarSyncMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: { recalcPastSessionsForPackage: recalcPastSessionsForPackageMock },
  }),
}));

vi.mock("@/app-layer/booking/emitPackageCalendarSync", () => ({
  emitPackageLinkedCalendarSync: emitPackageLinkedCalendarSyncMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({}),
}));

import { POST } from "./route";

const PKG_ID = "550e8400-e29b-41d4-a716-446655440010";

function req() {
  return new Request("http://localhost/recalc", { method: "POST" });
}

describe("POST patient-packages/[id]/recalc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1" } },
        service: { getAppointment: getAppointmentMock },
      },
    });
    getAppointmentMock.mockResolvedValue({ id: "appt-1", organizationId: "org-1" });
    emitPackageLinkedCalendarSyncMock.mockResolvedValue(undefined);
    recalcPastSessionsForPackageMock.mockResolvedValue({
      patientPackageId: PKG_ID,
      debited: [],
      skipped: [],
      outOfBalance: [],
    });
  });

  it("happy-path: passes gated organizationId + package id, returns summary counts", async () => {
    recalcPastSessionsForPackageMock.mockResolvedValue({
      patientPackageId: PKG_ID,
      debited: [
        { appointmentId: "appt-1", patientPackageItemId: "i1", serviceId: "s1", usageId: "u1" },
        { appointmentId: "appt-2", patientPackageItemId: "i1", serviceId: "s1", usageId: "u2" },
      ],
      skipped: [{ appointmentId: "appt-3", serviceId: "s1", reason: "already_debited" }],
      outOfBalance: [{ appointmentId: "appt-4", serviceId: "s1" }],
    });
    const res = await POST(req(), { params: Promise.resolve({ id: PKG_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, summary: { debited: 2, skipped: 1, outOfBalance: 1 } });
    expect(recalcPastSessionsForPackageMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      patientPackageId: PKG_ID,
      createdByPlatformUserId: "u1",
    });
    // best-effort calendar sync fired once per debited appointment
    expect(getAppointmentMock).toHaveBeenCalledTimes(2);
    expect(emitPackageLinkedCalendarSyncMock).toHaveBeenCalledTimes(2);
  });

  it("403 when the doctor gate rejects (no role)", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await POST(req(), { params: Promise.resolve({ id: PKG_ID }) });
    expect(res.status).toBe(403);
    expect(recalcPastSessionsForPackageMock).not.toHaveBeenCalled();
  });

  it("idempotent repeat = no-op: empty summary, no calendar sync", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: PKG_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, summary: { debited: 0, skipped: 0, outOfBalance: 0 } });
    expect(emitPackageLinkedCalendarSyncMock).not.toHaveBeenCalled();
  });

  it("maps a service error to 400", async () => {
    recalcPastSessionsForPackageMock.mockRejectedValue(new Error("package_not_found"));
    const res = await POST(req(), { params: Promise.resolve({ id: PKG_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "package_not_found" });
  });
});
