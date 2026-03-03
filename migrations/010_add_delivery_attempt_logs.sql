CREATE TABLE IF NOT EXISTS delivery_attempt_logs (
  id BIGSERIAL PRIMARY KEY,
  intent_type TEXT NULL,
  intent_event_id TEXT NULL,
  correlation_id TEXT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  reason TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempt_logs_event
  ON delivery_attempt_logs (intent_event_id);

CREATE INDEX IF NOT EXISTS idx_delivery_attempt_logs_correlation
  ON delivery_attempt_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_delivery_attempt_logs_channel_occurred
  ON delivery_attempt_logs (channel, occurred_at DESC);
