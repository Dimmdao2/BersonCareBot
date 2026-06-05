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

const RUBITIME_CONFLICT_ERRORS = new Set([
  "slot_already_taken",
  "duplicate_local_booking_id",
  "rubitime_slot_conflict",
  "external_slot_taken",
]);

export function isExternalSlotConflict(error: string): boolean {
  return RUBITIME_CONFLICT_ERRORS.has(error);
}

export type StaffRubitimeSyncContext = {
  rubitimeBranchId: string;
  rubitimeCooperatorId: string;
  rubitimeServiceId: string;
};

export type StaffManualRubitimeSyncResult =
  | { ok: true; rubitimeId: string; projectionWarning?: string }
  | { ok: false; error: "external_slot_taken" | "rubitime_sync_failed" };

export async function syncStaffManualAppointmentToRubitime(input: {
  syncPort: BookingSyncPort;
  appointment: BeAppointment;
  syncContext: StaffRubitimeSyncContext;
}): Promise<StaffManualRubitimeSyncResult> {
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
    const raw = syncResult.raw ?? {};
    const projectionWarning =
      typeof raw.projectionWarning === "string" && raw.projectionWarning.trim()
        ? raw.projectionWarning.trim()
        : undefined;
    if (projectionWarning) {
      console.warn("[staff-manual-create] integrator projectionWarning", {
        appointmentId: input.appointment.id,
        rubitimeId: createdRubitimeId,
        projectionWarning,
      });
    }
    return { ok: true, rubitimeId: createdRubitimeId, projectionWarning };
  } catch (syncErr) {
    const syncCode = syncErr instanceof Error ? syncErr.message : "rubitime_sync_failed";
    if (createdRubitimeId) {
      try {
        if (input.syncPort.cancelRecord) {
          await input.syncPort.cancelRecord(createdRubitimeId);
        } else {
          await input.syncPort.deleteRecord(createdRubitimeId);
        }
      } catch {
        // Best-effort cleanup of external transient record.
      }
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
