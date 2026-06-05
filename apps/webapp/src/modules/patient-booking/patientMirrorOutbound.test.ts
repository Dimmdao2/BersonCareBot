import { describe, expect, it, vi } from "vitest";
import type { AppointmentMirrorSyncService } from "@/modules/booking-appointment-sync/ports";
import type { BookingSyncPort } from "./ports";
import {
  mirrorPatientCancelToRubitime,
  mirrorPatientRescheduleToRubitime,
} from "./patientMirrorOutbound";

describe("patientMirrorOutbound", () => {
  it("cancel uses mirror sync and stamps attribution", async () => {
    const pushCancelToRubitime = vi.fn().mockResolvedValue(undefined);
    const stampCanonicalOutbound = vi.fn().mockResolvedValue(undefined);
    const status = await mirrorPatientCancelToRubitime({
      bookingId: "b1",
      rubitimeId: "rt-1",
      canonicalAppointmentId: "appt-1",
      appointmentMirrorSync: { pushCancelToRubitime, stampCanonicalOutbound } as unknown as AppointmentMirrorSyncService,
      syncPort: { cancelRecord: vi.fn() } as unknown as BookingSyncPort,
    });
    expect(status).toBe("ok");
    expect(pushCancelToRubitime).toHaveBeenCalledWith("rt-1");
    expect(stampCanonicalOutbound).toHaveBeenCalledWith("appt-1");
  });

  it("reschedule sends rubitimePatch via mirror", async () => {
    const pushRescheduleToRubitime = vi.fn().mockResolvedValue(undefined);
    const stampCanonicalOutbound = vi.fn().mockResolvedValue(undefined);
    const status = await mirrorPatientRescheduleToRubitime({
      bookingId: "b1",
      rubitimeId: "rt-2",
      canonicalAppointmentId: "appt-2",
      appointment: {
        startAt: "2026-06-01T10:00:00.000Z",
        endAt: "2026-06-01T11:00:00.000Z",
        branchId: null,
        specialistId: null,
        serviceId: null,
        status: "confirmed",
      },
      appointmentMirrorSync: {
        pushRescheduleToRubitime,
        stampCanonicalOutbound,
      } as unknown as AppointmentMirrorSyncService,
      syncPort: { updateRecord: vi.fn() } as unknown as BookingSyncPort,
    });
    expect(status).toBe("ok");
    expect(pushRescheduleToRubitime).toHaveBeenCalled();
    expect(stampCanonicalOutbound).toHaveBeenCalledWith("appt-2");
  });

  it("falls back to syncPort.cancelRecord without mirror", async () => {
    const cancelRecord = vi.fn().mockResolvedValue(undefined);
    const status = await mirrorPatientCancelToRubitime({
      bookingId: "b1",
      rubitimeId: "rt-3",
      canonicalAppointmentId: "appt-3",
      syncPort: { cancelRecord } as unknown as BookingSyncPort,
    });
    expect(status).toBe("ok");
    expect(cancelRecord).toHaveBeenCalledWith("rt-3");
  });
});
