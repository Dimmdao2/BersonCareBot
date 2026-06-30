-- F1b: canonical soft-delete for be_appointments.
-- Inbound Rubitime delete/remove must hide the canonical row from doctor calendar /
-- slot-availability / KPI while keeping it fetchable by id (payments/refund/history).
-- Decision B: add `deleted_at` column and exclude it from canonical reads + the no-overlap
-- exclusion constraint (so a soft-deleted row no longer blocks its slot).

ALTER TABLE "be_appointments"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL;

-- Recreate the specialist no-overlap exclusion constraint adding `deleted_at IS NULL`,
-- so soft-deleted rows stop reserving the slot. Status whitelist preserved verbatim.
ALTER TABLE "be_appointments"
  DROP CONSTRAINT IF EXISTS "be_appointments_specialist_no_overlap";

ALTER TABLE "be_appointments"
  ADD CONSTRAINT "be_appointments_specialist_no_overlap"
  EXCLUDE USING gist (
    specialist_id WITH =,
    tstzrange(start_at, end_at, '[)'::text) WITH &&
  )
  WHERE (
    specialist_id IS NOT NULL
    AND deleted_at IS NULL
    AND status <> ALL (ARRAY[
      'cancelled_by_patient'::text,
      'cancelled_by_specialist'::text,
      'late_cancellation'::text,
      'no_show'::text,
      'completed'::text,
      'visit_confirmed'::text
    ])
  );
