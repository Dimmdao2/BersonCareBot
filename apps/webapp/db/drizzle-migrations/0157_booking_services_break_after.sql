ALTER TABLE booking_services
  ADD COLUMN IF NOT EXISTS break_after_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE booking_services
  DROP CONSTRAINT IF EXISTS booking_services_break_after_check;

ALTER TABLE booking_services
  ADD CONSTRAINT booking_services_break_after_check
  CHECK (break_after_minutes >= 0 AND break_after_minutes % 5 = 0);
