import { describe, expect, it, vi, afterEach } from "vitest";
import * as rubitimeCreateRollback from "@/modules/patient-booking/rubitimeCreateRollback";
import {
  finalizeStaffManualRubitimeSyncSuccess,
  isExternalSlotConflict,
  rollbackStaffFailedRubitimeCreateRecord,
  syncStaffManualAppointmentToRubitime,
} from "./staffRubitimeManualBooking";

describe("staffRubitimeManualBooking", () => {
  const appointment = {
    id: "appt-1",
    organizationId: "org-1",
    startAt: "2026-06-01T10:00:00.000Z",
    endAt: "2026-06-01T11:00:00.000Z",
    phoneNormalized: "+79001234567",
  } as never;

  const syncContext = {
    rubitimeBranchId: "1",
    rubitimeCooperatorId: "2",
    rubitimeServiceId: "3",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isExternalSlotConflict recognizes rubitime conflict codes", () => {
    expect(isExternalSlotConflict("slot_already_taken")).toBe(true);
    expect(isExternalSlotConflict("rubitime_sync_failed")).toBe(false);
  });

  it("syncStaffManualAppointmentToRubitime returns rubitimeId on success", async () => {
    const createRecord = vi.fn().mockResolvedValue({ rubitimeId: "rt-1", raw: {} });
    const result = await syncStaffManualAppointmentToRubitime({
      syncPort: { createRecord } as never,
      appointment,
      syncContext,
    });
    expect(result).toEqual({ ok: true, rubitimeId: "rt-1" });
  });

  it("syncStaffManualAppointmentToRubitime maps external slot conflict", async () => {
    const createRecord = vi.fn().mockRejectedValue(new Error("slot_already_taken"));
    const deleteRecord = vi.fn();
    const result = await syncStaffManualAppointmentToRubitime({
      syncPort: { createRecord, deleteRecord } as never,
      appointment,
      syncContext,
    });
    expect(result).toEqual({ ok: false, error: "external_slot_taken" });
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it("finalizeStaffManualRubitimeSyncSuccess returns projectionWarning from integrator raw", () => {
    const result = finalizeStaffManualRubitimeSyncSuccess({
      raw: { projectionWarning: "fetch_failed" },
      appointmentId: "appt-1",
      rubitimeId: "rt-warn",
    });
    expect(result).toEqual({ ok: true, rubitimeId: "rt-warn", projectionWarning: "fetch_failed" });
  });

  it("syncStaffManualAppointmentToRubitime rolls back when finalize fails after rubitime id", async () => {
    const rollbackSpy = vi
      .spyOn(rubitimeCreateRollback, "rollbackFailedRubitimeCreate")
      .mockResolvedValue(undefined);
    const createRecord = vi.fn().mockResolvedValue({ rubitimeId: "rt-rollback", raw: {} });

    const result = await syncStaffManualAppointmentToRubitime({
      syncPort: { createRecord } as never,
      appointment,
      syncContext,
      finalizeSuccess: () => {
        throw new Error("rubitime_sync_failed");
      },
    });

    expect(result).toEqual({ ok: false, error: "rubitime_sync_failed" });
    expect(rollbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        rubitimeId: "rt-rollback",
        rollbackSource: "staff_manual_create_rollback",
      }),
    );
    rollbackSpy.mockRestore();
  });

  it("rollbackStaffFailedRubitimeCreateRecord delegates to shared rollback helper", async () => {
    const rollbackSpy = vi
      .spyOn(rubitimeCreateRollback, "rollbackFailedRubitimeCreate")
      .mockResolvedValue(undefined);
    const deleteRecord = vi.fn();

    await rollbackStaffFailedRubitimeCreateRecord({
      syncPort: { deleteRecord } as never,
      organizationId: "org-1",
      rubitimeId: "rt-rollback",
    });

    expect(rollbackSpy).toHaveBeenCalledWith({
      syncPort: { deleteRecord },
      organizationId: "org-1",
      rubitimeId: "rt-rollback",
      rollbackSource: "staff_manual_create_rollback",
    });
  });
});
