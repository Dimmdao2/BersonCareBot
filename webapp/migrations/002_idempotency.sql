-- Idempotency keys for integrator webhooks (POST /api/integrator/events, reminders/dispatch).
-- One row per idempotency key; request_hash detects key reuse with different payload.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status SMALLINT NOT NULL,
  response_body JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);
