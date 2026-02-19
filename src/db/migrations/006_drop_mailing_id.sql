-- 006_drop_mailing_id.sql
ALTER TABLE user_subscriptions
DROP COLUMN mailing_id;

DROP INDEX IF EXISTS idx_user_subscriptions_mailing;
