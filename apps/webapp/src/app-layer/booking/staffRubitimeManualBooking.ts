/**
 * Shared staff manual create + Rubitime mirror orchestration (doctor/admin).
 * @see docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md
 */
import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import {
  staffBookingContactNameFromAppointment,
} from "@/app-layer/booking/staffBookingIntegratorEvent";
import { logBookingRubitimeMirrorFailed } from "@/modules/patient-booking/bookingLifecycleObservability";
import { rollbackFailedRubitimeCreate } from "@/modules/patient-booking/rubitimeCreateRollback";

const RUBITIME_CONFLICT_ERRORS = new Set([
  "slot_already_taken",
  "duplicate_local_booking_id",
  "rubitime_slot_conflict",
  "external_slot_taken",
]);

export function isExternalSlotConflict(error: string): boolean {
  return RUBITIME_CONFLICT_ERRORS.has(error);
}

/** Staff manual create-rollback: hard-delete Rubitime record (canonical rollback is separate). */
export async function rollbackStaffFailedRubitimeCreateRecord(input: {
  syncPort: BookingSyncPort;
  organizationId: string;
  rubitimeId: string;
}): Promise<void> {
  await rollbackFailedRubitimeCreate({
    syncPort: input.syncPort,
    organizationId: input.organizationId,
    rubitimeId: input.rubitimeId,
    rollbackSource: "staff_manual_create_rollback",
  });
}

export type StaffRubitimeSyncContext = {
  rubitimeBranchId: string;
  rubitimeCooperatorId: string;
  rubitimeServiceId: string;
};

export type StaffManualRubitimeSyncResult =
  | { ok: true; rubitimeId: string; projectionWarning?: string }
  | { ok: false; error: "external_slot_taken" | "rubitime_sync_failed" };

export function finalizeStaffManualRubitimeSyncSuccess(input: {
  raw: Record<string, unknown>;
  appointmentId: string;
  rubitimeId: string;
}): StaffManualRubitimeSyncResult {
  const projectionWarning =
    typeof input.raw.projectionWarning === "string" && input.raw.projectionWarning.trim()
      ? input.raw.projectionWarning.trim()
      : undefined;
  if (projectionWarning) {
    console.warn("[staff-manual-create] integrator projectionWarning", {
      appointmentId: input.appointmentId,
      rubitimeId: input.rubitimeId,
      projectionWarning,
    });
  }
  return { ok: true, rubitimeId: input.rubitimeId, projectionWarning };
}

export async function syncStaffManualAppointmentToRubitime(input: {
  syncPort: BookingSyncPort;
  appointment: BeAppointment;
  syncContext: StaffRubitimeSyncContext;
  finalizeSuccess?: typeof finalizeStaffManualRubitimeSyncSuccess;
}): Promise<StaffManualRubitimeSyncResult> {
  const finalizeSuccess = input.finalizeSuccess ?? finalizeStaffManualRubitimeSyncSuccess;
  let createdRubitimeId: string | null = null;
  try {
    const syncResult = await input.syncPort.createRecord({
      version: "v2",
      rubitimeBranchId: input.syncContext.rubitimeBranchId,
      rubitimeCooperatorId: input.syncContext.rubitimeCooperatorId,
      rubitimeServiceId: input.syncContext.rubitimeServiceId,
      slotStart: input.appointment.startAt,
      contactName: staffBookingContactNameFromAppointment(input.appointment),
      contactPhone: input.appointment.phoneNormalized ?? "+70000000000",
      localBookingId: input.appointment.id,
    });
    createdRubitimeId = syncResult.rubitimeId?.trim() || null;
    if (!createdRubitimeId) throw new Error("rubitime_id_missing");
    return finalizeSuccess({
      raw: (syncResult.raw ?? {}) as Record<string, unknown>,
      appointmentId: input.appointment.id,
      rubitimeId: createdRubitimeId,
    });
  } catch (syncErr) {
    const syncCode = syncErr instanceof Error ? syncErr.message : "rubitime_sync_failed";
    if (createdRubitimeId) {
      await rollbackStaffFailedRubitimeCreateRecord({
        syncPort: input.syncPort,
        organizationId: input.appointment.organizationId,
        rubitimeId: createdRubitimeId,
      });
    }
    logBookingRubitimeMirrorFailed({
      bookingId: input.appointment.id,
      action: "create_record",
      rubitimeId: createdRubitimeId,
    });
    if (isExternalSlotConflict(syncCode)) {
      return { ok: false, error: "external_slot_taken" };
    }
    return { ok: false, error: "rubitime_sync_failed" };
  }
}

export async function rollbackStaffManualAppointment(input: {
  deleteAppointmentHard?: (params: {
    organizationId: string;
    appointmentId: string;
  }) => Promise<boolean>;
  transitionAppointmentStatus: (params: {
    appointmentId: string;
    toStatus: "cancelled_by_specialist";
    actorId: string;
    payload: { reason: string };
  }) => Promise<unknown>;
  organizationId: string;
  appointmentId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  if (input.deleteAppointmentHard) {
    try {
      const deleted = await input.deleteAppointmentHard({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
      });
      if (deleted) return;
    } catch {
      // Fall through to status transition fallback.
    }
  }
  try {
    await input.transitionAppointmentStatus({
      appointmentId: input.appointmentId,
      toStatus: "cancelled_by_specialist",
      actorId: input.actorId,
      payload: { reason: input.reason },
    });
  } catch {
    // Keep handler deterministic even if rollback transition fails.
  }
}
