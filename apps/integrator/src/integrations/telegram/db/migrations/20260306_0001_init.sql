-- 001_init.sql

CREATE TABLE IF NOT EXISTS telegram_users (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL UNIQUE,
  username text NULL,
  first_name text NULL,
  last_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
  topic text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chat_id, topic)
);
