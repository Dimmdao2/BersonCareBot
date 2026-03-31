ALTER TABLE IF EXISTS rubitime_records
  ADD COLUMN IF NOT EXISTS gcal_event_id TEXT NULL;

CREATE TABLE IF NOT EXISTS booking_calendar_map (
  id BIGSERIAL PRIMARY KEY,
  rubitime_record_id TEXT NOT NULL UNIQUE,
  gcal_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_calendar_map_gcal_event_id
  ON booking_calendar_map (gcal_event_id);
