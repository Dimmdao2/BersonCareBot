-- Exact Rubitime record URL for «Изменить» in patient cabinet (not support/bot fallback).
ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS rubitime_manage_url TEXT;

COMMENT ON COLUMN patient_bookings.rubitime_manage_url IS
  'HTTPS URL to manage this record in Rubitime (from webhook payload or create-record response).';
