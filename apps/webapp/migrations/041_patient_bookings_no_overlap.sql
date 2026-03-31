-- Prevent overlapping confirmed/rescheduled slots (same resource / calendar).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_slot_no_overlap;

ALTER TABLE patient_bookings
  ADD CONSTRAINT patient_bookings_slot_no_overlap
  EXCLUDE USING gist (
    tstzrange(slot_start, slot_end, '[)') WITH &&
  )
  WHERE (status IN ('confirmed', 'rescheduled'));
