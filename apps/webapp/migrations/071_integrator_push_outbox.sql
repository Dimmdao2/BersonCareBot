-- Retries for webapp → integrator HTTP mirror (settings, reminder rules, etc.): sync first, outbox on failure.
CREATE TABLE IF NOT EXISTS integrator_push_outbox (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT        NOT NULL,
  idempotency_key TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'pending',
  attempts_done   INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 8,
  next_try_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integrator_push_outbox_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT integrator_push_outbox_status_check CHECK (status IN ('pending', 'processing', 'done', 'dead'))
);

CREATE INDEX IF NOT EXISTS idx_integrator_push_outbox_due
  ON integrator_push_outbox (status, next_try_at)
  WHERE status = 'pending';

COMMENT ON TABLE integrator_push_outbox IS
  'Webapp-side queue when signed POST to integrator fails after local DB commit; worker retries delivery.';
