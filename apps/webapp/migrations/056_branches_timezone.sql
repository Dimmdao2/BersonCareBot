-- Stage 1 (TIMEZONE_UTC_NORMALIZATION): IANA timezone per integrator branch projection row.
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
