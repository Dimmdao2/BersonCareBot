-- 008_worker_schema.sql
-- Таблицы и колонка для воркера рассылок (mailingWorker).
-- telegram_users.is_active: пользователь отписался/заблокировал бота.
-- mailings: очередь рассылок по темам (mailing_topics).
-- mailing_logs: лог отправок (user_id = telegram_users.id, mailing_id = mailings.id).

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS mailings (
  id bigserial PRIMARY KEY,
  topic_id bigint NOT NULL REFERENCES mailing_topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mailing_logs (
  user_id bigint NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  mailing_id bigint NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  status text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  error text,
  PRIMARY KEY (user_id, mailing_id)
);
