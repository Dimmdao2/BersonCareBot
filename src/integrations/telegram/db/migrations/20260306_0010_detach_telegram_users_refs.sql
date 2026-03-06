-- 0010_detach_telegram_users_refs.sql
-- Detach legacy Telegram-linked tables from telegram_users primary key and bind to users.id.

DO $$
DECLARE
  row_data RECORD;
  resolved_identity_id BIGINT;
  resolved_user_id BIGINT;
BEGIN
  FOR row_data IN
    SELECT DISTINCT
      tu.telegram_id::text AS external_id,
      tu.created_at,
      tu.updated_at
    FROM telegram_users tu
    JOIN (
      SELECT user_id FROM user_subscriptions
      UNION
      SELECT user_id FROM mailing_logs
    ) refs ON refs.user_id = tu.id
  LOOP
    resolved_identity_id := NULL;
    resolved_user_id := NULL;

    SELECT i.id, i.user_id
      INTO resolved_identity_id, resolved_user_id
    FROM identities i
    WHERE i.resource = 'telegram'
      AND i.external_id = row_data.external_id
    LIMIT 1;

    IF resolved_identity_id IS NULL THEN
      INSERT INTO users (created_at, updated_at)
      VALUES (COALESCE(row_data.created_at, now()), COALESCE(row_data.updated_at, now()))
      RETURNING id INTO resolved_user_id;

      INSERT INTO identities (user_id, resource, external_id, created_at, updated_at)
      VALUES (
        resolved_user_id,
        'telegram',
        row_data.external_id,
        COALESCE(row_data.created_at, now()),
        COALESCE(row_data.updated_at, now())
      )
      ON CONFLICT (resource, external_id)
      DO UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING id, user_id INTO resolved_identity_id, resolved_user_id;

      IF resolved_identity_id IS NULL THEN
        SELECT i.id, i.user_id
          INTO resolved_identity_id, resolved_user_id
        FROM identities i
        WHERE i.resource = 'telegram'
          AND i.external_id = row_data.external_id
        LIMIT 1;
      END IF;
    END IF;
  END LOOP;
END $$;

UPDATE user_subscriptions us
SET user_id = i.user_id
FROM telegram_users tu
JOIN identities i
  ON i.resource = 'telegram'
  AND i.external_id = tu.telegram_id::text
WHERE us.user_id = tu.id;

UPDATE mailing_logs ml
SET user_id = i.user_id
FROM telegram_users tu
JOIN identities i
  ON i.resource = 'telegram'
  AND i.external_id = tu.telegram_id::text
WHERE ml.user_id = tu.id;

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;

ALTER TABLE mailing_logs
  DROP CONSTRAINT IF EXISTS mailing_logs_user_id_fkey;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE mailing_logs
  ADD CONSTRAINT mailing_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
