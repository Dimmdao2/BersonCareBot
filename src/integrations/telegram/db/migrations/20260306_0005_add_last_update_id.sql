-- 005_add_last_update_id.sql

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS last_update_id bigint;

CREATE INDEX IF NOT EXISTS telegram_users_last_update_id_idx
  ON telegram_users(last_update_id);
