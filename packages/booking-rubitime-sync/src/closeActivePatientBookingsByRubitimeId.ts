import type { SqlExecutor } from "./sql.js";

/** Active mirror rows that block slot overlap / show stale manage links. */
const ACTIVE_MIRROR_STATUSES = [
  "creating",
  "awaiting_payment",
  "confirmed",
  "rescheduled",
  "cancelling",
  "cancel_failed",
] as const;

/**
 * Close duplicate active rows sharing the same Rubitime record id (scenario E).
 * Primary row may already be cancelled/deleted separately.
 */
export async function closeActivePatientBookingsByRubitimeId(
  db: SqlExecutor,
  rubitimeId: string,
  exceptId?: string | null,
): Promise<void> {
  const rt = rubitimeId.trim();
  if (!rt) return;
  await db.query(
    `UPDATE public.patient_bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         rubitime_manage_url = NULL,
         updated_at = now()
     WHERE rubitime_id = $1
       AND ($2::uuid IS NULL OR id <> $2::uuid)
       AND status = ANY($3::text[])`,
    [rt, exceptId ?? null, ACTIVE_MIRROR_STATUSES],
  );
}
