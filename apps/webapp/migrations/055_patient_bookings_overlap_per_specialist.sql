-- Scope no-overlap constraint to the same specialist for confirmed/rescheduled bookings.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_slot_no_overlap;

ALTER TABLE patient_bookings
  ADD CONSTRAINT patient_bookings_slot_no_overlap
  EXCLUDE USING gist (
    rubitime_cooperator_id_snapshot WITH =,
    tstzrange(slot_start, slot_end, '[)') WITH &&
  )
  WHERE (status IN ('confirmed', 'rescheduled') AND rubitime_cooperator_id_snapshot IS NOT NULL);
