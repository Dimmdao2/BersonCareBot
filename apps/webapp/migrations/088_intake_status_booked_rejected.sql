-- 088: add booked / rejected to online intake statuses
--
-- The inline CHECK on online_intake_requests was created without an explicit name,
-- so PostgreSQL assigned "online_intake_requests_status_check".
-- We drop it and replace it with one that includes the two new statuses.

ALTER TABLE online_intake_requests
  DROP CONSTRAINT IF EXISTS online_intake_requests_status_check;

ALTER TABLE online_intake_requests
  ADD CONSTRAINT online_intake_requests_status_check
    CHECK (status IN ('new', 'in_review', 'contacted', 'booked', 'rejected', 'closed'));

-- Partial index for fast new-intake badge counts
CREATE INDEX IF NOT EXISTS idx_online_intake_requests_status_new
  ON online_intake_requests (status)
  WHERE status = 'new';
