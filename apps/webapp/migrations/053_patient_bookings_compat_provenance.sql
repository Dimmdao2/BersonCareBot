-- Migration 053: Provenance for compat-sync rows (Stage 2 F-04).
-- Free-text labels; UI maps known values to Russian copy.

ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS provenance_created_by TEXT,
  ADD COLUMN IF NOT EXISTS provenance_updated_by TEXT;

COMMENT ON COLUMN patient_bookings.provenance_created_by IS 'Origin of create: e.g. rubitime_external, patient_native';
COMMENT ON COLUMN patient_bookings.provenance_updated_by IS 'Last external sync actor hint: e.g. rubitime_external';
