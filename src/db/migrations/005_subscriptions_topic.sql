-- 005_subscriptions_topic.sql
ALTER TABLE user_subscriptions
ADD COLUMN topic_id integer REFERENCES mailing_topics(id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_topic
ON user_subscriptions(user_id, topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_topic
ON user_subscriptions(user_id, topic_id);

UPDATE user_subscriptions s
SET topic_id = m.topic_id
FROM mailings m
WHERE s.mailing_id = m.id
  AND s.topic_id IS NULL;

ALTER TABLE user_subscriptions
ALTER COLUMN topic_id SET NOT NULL;
