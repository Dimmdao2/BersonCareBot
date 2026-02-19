-- 006_add_last_start_at.sql

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS last_start_at timestamptz;

CREATE INDEX IF NOT EXISTS telegram_users_last_start_at_idx
  ON telegram_users(last_start_at);
