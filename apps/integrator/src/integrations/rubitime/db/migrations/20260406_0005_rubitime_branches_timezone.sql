-- IANA timezone per Rubitime branch (integrator DB). Used by branchTimezone resolution on webhook ingest.
-- Webapp `branches` is not guaranteed to exist when only integrator migrations are applied.
ALTER TABLE rubitime_branches
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
