import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const staffRescheduleMock = vi.hoisted(() => vi.fn());
const updateRecordMock = vi.hoisted(() => vi.fn());
const getBookingByCanonicalAppointmentMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/booking/staffAppointmentLifecycleEffects", () => ({
  applyStaffRescheduleSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({ updateRecord: updateRecordMock, emitBookingEvent: vi.fn() }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffReschedule: staffRescheduleMock },
    appointmentProjection: null,
    patientBooking: {
      getBookingByCanonicalAppointment: getBookingByCanonicalAppointmentMock,
    },
    payments: null,
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  }),
}));

import { POST } from "./route";

describe("POST manual-reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when lifecycle accepts reschedule", async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue(null);
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: "appt-1",
            startAt: "2026-06-01T09:00:00.000Z",
            endAt: "2026-06-01T10:00:00.000Z",
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
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
    expect(staffRescheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 60 }),
    );
    expect(updateRecordMock).not.toHaveBeenCalled();
  });

  it("returns external_slot_taken without extra canonical reschedule when Rubitime slot is busy", async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue({
      rubitimeId: "rt-1",
    });
    updateRecordMock.mockRejectedValue(new Error("slot_already_taken"));
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: "appt-1",
            startAt: "2026-06-01T09:00:00.000Z",
            endAt: "2026-06-01T10:00:00.000Z",
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
        },
      },
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
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("external_slot_taken");
    expect(staffRescheduleMock).not.toHaveBeenCalled();
  });

  it("rolls back Rubitime update when canonical reschedule throws slot_overlap", async () => {
    getBookingByCanonicalAppointmentMock.mockResolvedValue({
      rubitimeId: "rt-1",
    });
    updateRecordMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    staffRescheduleMock.mockRejectedValue(new Error("slot_overlap"));
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          getAppointment: vi.fn().mockResolvedValue({
            id: "appt-1",
            startAt: "2026-06-01T09:00:00.000Z",
            endAt: "2026-06-01T10:00:00.000Z",
            durationMinutes: 60,
            branchId: null,
            specialistId: null,
            serviceId: null,
          }),
        },
      },
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
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("slot_overlap");
    expect(updateRecordMock).toHaveBeenNthCalledWith(1, {
      rubitimeId: "rt-1",
      slotStart: "2026-06-01T10:00:00.000Z",
      slotEnd: "2026-06-01T11:00:00.000Z",
    });
    expect(updateRecordMock).toHaveBeenNthCalledWith(2, {
      rubitimeId: "rt-1",
      slotStart: "2026-06-01T09:00:00.000Z",
      slotEnd: "2026-06-01T10:00:00.000Z",
    });
  });
});
