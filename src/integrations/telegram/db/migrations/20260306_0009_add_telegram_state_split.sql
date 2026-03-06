-- 0009_add_telegram_state_split.sql
-- Introduces Telegram-only runtime state storage separated from canonical identity/contact tables.

CREATE TABLE IF NOT EXISTS telegram_state (
  identity_id BIGINT PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  username TEXT NULL,
  first_name TEXT NULL,
  last_name TEXT NULL,
  state TEXT NULL,
  notify_spb BOOLEAN NOT NULL DEFAULT false,
  notify_msk BOOLEAN NOT NULL DEFAULT false,
  notify_online BOOLEAN NOT NULL DEFAULT false,
  last_update_id BIGINT NULL,
  last_start_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_state_last_update_id_idx
  ON telegram_state(last_update_id);

CREATE INDEX IF NOT EXISTS telegram_state_last_start_at_idx
  ON telegram_state(last_start_at);

DO $$
DECLARE
  row_data RECORD;
  resolved_identity_id BIGINT;
  resolved_user_id BIGINT;
BEGIN
  FOR row_data IN
    SELECT
      telegram_id::text AS external_id,
      username,
      first_name,
      last_name,
      state,
      notify_spb,
      notify_msk,
      notify_online,
      last_update_id,
      last_start_at,
      is_active,
      phone,
      created_at,
      updated_at
    FROM telegram_users
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

    IF row_data.phone IS NOT NULL THEN
      INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
      VALUES (
        resolved_user_id,
        'phone',
        row_data.phone,
        'telegram',
        NULL,
        COALESCE(row_data.created_at, now()),
        COALESCE(row_data.updated_at, now())
      )
      ON CONFLICT (type, value_normalized)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        label = EXCLUDED.label,
        updated_at = EXCLUDED.updated_at;
    END IF;

    INSERT INTO telegram_state (
      identity_id,
      username,
      first_name,
      last_name,
      state,
      notify_spb,
      notify_msk,
      notify_online,
      last_update_id,
      last_start_at,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      resolved_identity_id,
      row_data.username,
      row_data.first_name,
      row_data.last_name,
      row_data.state,
      COALESCE(row_data.notify_spb, false),
      COALESCE(row_data.notify_msk, false),
      COALESCE(row_data.notify_online, false),
      row_data.last_update_id,
      row_data.last_start_at,
      COALESCE(row_data.is_active, true),
      COALESCE(row_data.created_at, now()),
      COALESCE(row_data.updated_at, now())
    )
    ON CONFLICT (identity_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      state = EXCLUDED.state,
      notify_spb = EXCLUDED.notify_spb,
      notify_msk = EXCLUDED.notify_msk,
      notify_online = EXCLUDED.notify_online,
      last_update_id = EXCLUDED.last_update_id,
      last_start_at = EXCLUDED.last_start_at,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END $$;
