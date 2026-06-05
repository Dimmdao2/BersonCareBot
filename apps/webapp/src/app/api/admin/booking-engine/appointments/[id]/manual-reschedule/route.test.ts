import { describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const staffRescheduleMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/booking/staffAppointmentLifecycleEffects", () => ({
  applyStaffRescheduleSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => null,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffReschedule: staffRescheduleMock },
    appointmentProjection: null,
    appointmentMirrorSync: null,
    rubitimeCanonicalProjection: {
      isBridgeEnabled: async () => true,
    },
    patientBooking: null,
    payments: null,
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  }),
}));

import { POST } from "./route";

describe("POST admin manual-reschedule", () => {
  it("returns ok when lifecycle accepts reschedule", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: "appt-1",
            startAt: "2026-06-01T09:00:00.000Z",
            endAt: "2026-06-01T10:00:00.000Z",
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
            status: "confirmed",
          }),
          getRubitimeAppointmentId: vi.fn().mockResolvedValue(null),
        },
      },
    });
    staffRescheduleMock.mockResolvedValue({
      ok: true,
      appointment: { id: "appt-1", platformUserId: "u1" },
      reschedulePolicy: { notifyPatient: true, notifyStaff: true },
    });

    const res = await POST(
      new Request("http://localhost/manual-reschedule", {
        method: "POST",
        body: JSON.stringify({
          newStartAt: "2026-06-01T10:00:00.000Z",
          newEndAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("returns slot_overlap when lifecycle throws overlap error", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: "appt-1",
            startAt: "2026-06-01T09:00:00.000Z",
            endAt: "2026-06-01T10:00:00.000Z",
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
            status: "confirmed",
          }),
          getRubitimeAppointmentId: vi.fn().mockResolvedValue(null),
        },
      },
    });
    staffRescheduleMock.mockRejectedValue(new Error("slot_overlap"));

    const res = await POST(
      new Request("http://localhost/manual-reschedule", {
        method: "POST",
        body: JSON.stringify({
          newStartAt: "2026-06-01T10:00:00.000Z",
          newEndAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("slot_overlap");
  });
});
