CREATE TABLE IF NOT EXISTS projection_outbox (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT        NOT NULL,
  idempotency_key TEXT      NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'pending',
  attempts_done INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 5,
  next_try_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projection_outbox_due
  ON projection_outbox (status, next_try_at)
  WHERE status = 'pending';
