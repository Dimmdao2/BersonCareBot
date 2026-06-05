import type { ExistingPatientBookingRow, RubitimePatientBookingUpsertInput } from "./upsertPatientBookingFromRubitime.js";
import type { SqlExecutor } from "./sql.js";

const TERMINAL_CANONICAL_STATUSES = new Set([
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "no_show",
  "late_cancellation",
]);

/**
 * Webapp + integrator: do not apply inbound Rubitime confirmed/rescheduled upsert onto
 * native rows that are already cancelled or linked to a terminal canonical appointment.
 */
export async function shouldSkipNativeReviveUpdate(
  db: SqlExecutor,
  existingRow: ExistingPatientBookingRow,
  input: Pick<RubitimePatientBookingUpsertInput, "status">,
): Promise<boolean> {
  if (
    existingRow.source !== "native"
    || input.status === "cancelled"
    || !(input.status === "confirmed" || input.status === "rescheduled" || input.status === "awaiting_payment")
  ) {
    return false;
  }
  if (
    existingRow.status === "cancelled"
    || existingRow.status === "cancelling"
    || existingRow.status === "cancel_failed"
  ) {
    return true;
  }
  const apptId = existingRow.canonical_appointment_id;
  if (!apptId) return false;
  const canonical = await db.query<{ status: string }>(
    `SELECT status FROM public.be_appointments WHERE id = $1::uuid LIMIT 1`,
    [apptId],
  );
  const cs = canonical.rows[0]?.status;
  return cs != null && TERMINAL_CANONICAL_STATUSES.has(cs);
}
