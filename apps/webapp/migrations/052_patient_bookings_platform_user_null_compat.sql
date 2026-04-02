-- Migration 052: allow unlinked Rubitime compat rows (F-01).
-- Native bookings must still have a platform user; projection-only rows may omit linkage until phone match exists.

ALTER TABLE patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_platform_user_native_required;

ALTER TABLE patient_bookings
  ALTER COLUMN platform_user_id DROP NOT NULL;

ALTER TABLE patient_bookings
  ADD CONSTRAINT patient_bookings_platform_user_native_required
  CHECK (
    source <> 'native'
    OR platform_user_id IS NOT NULL
  );
