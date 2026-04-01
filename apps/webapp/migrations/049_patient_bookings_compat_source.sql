-- Migration 049: Add source and compat_quality fields to patient_bookings
-- These fields track whether a row was created natively (through webapp UI)
-- or via compat-sync from a Rubitime webhook projection.

ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'native'
    CHECK (source IN ('native', 'rubitime_projection')),
  ADD COLUMN IF NOT EXISTS compat_quality TEXT
    CHECK (compat_quality IN ('full', 'partial', 'minimal'));

CREATE INDEX IF NOT EXISTS idx_patient_bookings_source ON patient_bookings (source);
CREATE INDEX IF NOT EXISTS idx_patient_bookings_rubitime_id ON patient_bookings (rubitime_id) WHERE rubitime_id IS NOT NULL;
