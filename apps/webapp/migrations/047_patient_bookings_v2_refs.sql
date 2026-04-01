-- Migration 047: patient_bookings v2 refs (FK columns + snapshot columns)
-- Source: docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/MIGRATION_CONTRACT_V2.md §2
-- All new columns are NULLABLE — legacy records are not affected.
-- Must be applied AFTER migration 046_booking_catalog_v2.sql.

-- FK references to the v2 catalog (nullable for dual-write safety)
ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS branch_id         UUID REFERENCES booking_branches(id),
  ADD COLUMN IF NOT EXISTS service_id        UUID REFERENCES booking_services(id),
  ADD COLUMN IF NOT EXISTS branch_service_id UUID REFERENCES booking_branch_services(id);

-- Snapshot columns (immutable after booking creation, human-readable values at booking time)
ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS city_code_snapshot           TEXT,
  ADD COLUMN IF NOT EXISTS branch_title_snapshot        TEXT,
  ADD COLUMN IF NOT EXISTS service_title_snapshot       TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes_snapshot    INTEGER,
  ADD COLUMN IF NOT EXISTS price_minor_snapshot         INTEGER;

-- Rubitime ID snapshots (values at booking creation time)
ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS rubitime_branch_id_snapshot      TEXT,
  ADD COLUMN IF NOT EXISTS rubitime_cooperator_id_snapshot  TEXT,
  ADD COLUMN IF NOT EXISTS rubitime_service_id_snapshot     TEXT;

-- Indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_patient_bookings_branch_id
  ON patient_bookings(branch_id);

CREATE INDEX IF NOT EXISTS idx_patient_bookings_service_id
  ON patient_bookings(service_id);

CREATE INDEX IF NOT EXISTS idx_patient_bookings_branch_service_id
  ON patient_bookings(branch_service_id);
