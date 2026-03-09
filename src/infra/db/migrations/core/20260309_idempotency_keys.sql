-- 20260309_idempotency_keys.sql
-- Таблица для дедупликации входящих событий (gateway).

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
  ON idempotency_keys(expires_at);
