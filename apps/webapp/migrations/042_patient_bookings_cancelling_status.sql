ALTER TABLE patient_bookings DROP CONSTRAINT IF EXISTS patient_bookings_status_check;

ALTER TABLE patient_bookings
  ADD CONSTRAINT patient_bookings_status_check
  CHECK (status IN (
    'creating',
    'confirmed',
    'cancelling',
    'cancel_failed',
    'cancelled',
    'rescheduled',
    'completed',
    'no_show',
    'failed_sync'
  ));
