CREATE TABLE IF NOT EXISTS rubitime_records (
  id BIGSERIAL PRIMARY KEY,
  rubitime_record_id TEXT NOT NULL UNIQUE,
  phone_normalized TEXT NULL,
  record_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'updated', 'canceled')),
  payload_json JSONB NOT NULL,
  last_event TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubitime_events (
  id BIGSERIAL PRIMARY KEY,
  rubitime_record_id TEXT NULL,
  event TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rubitime_records_phone_normalized
  ON rubitime_records (phone_normalized);

CREATE INDEX IF NOT EXISTS idx_rubitime_records_record_at
  ON rubitime_records (record_at);
