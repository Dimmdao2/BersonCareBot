-- Stage 1 (TIMEZONE_UTC_NORMALIZATION): IANA timezone per booking catalog branch.
ALTER TABLE booking_branches
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
