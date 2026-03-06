-- 007_align_mailing_topics.sql
-- Приводит схему к коду: topicsRepo/subscriptionsRepo ожидают mailing_topics (key, is_active)
-- и user_subscriptions (topic_id, is_active).

-- subscriptions -> mailing_topics (то же содержимое, добавляем key и is_active)
ALTER TABLE subscriptions RENAME TO mailing_topics;

ALTER TABLE mailing_topics
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE mailing_topics SET key = code WHERE key IS NULL;
ALTER TABLE mailing_topics ALTER COLUMN key SET NOT NULL;

-- user_subscriptions: имена колонок под код (topic_id, is_active)
ALTER TABLE user_subscriptions RENAME COLUMN subscription_id TO topic_id;
ALTER TABLE user_subscriptions RENAME COLUMN active TO is_active;
