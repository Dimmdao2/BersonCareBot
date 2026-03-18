-- 0012_backfill_identities_minimal.sql
-- Backfill users/identities/contacts/telegram_state from telegram_users using only
-- columns that exist after 0002 (telegram_id, username, first_name, last_name, phone, created_at, updated_at).
-- Use when 0011 did not run or failed (e.g. missing columns). Idempotent.

DO $$
DECLARE
  row_data RECORD;
  resolved_identity_id BIGINT;
  resolved_user_id BIGINT;
BEGIN
  FOR row_data IN
    SELECT
      tu.telegram_id::text AS external_id,
      tu.username,
      tu.first_name,
      tu.last_name,
      tu.phone,
      tu.created_at,
      tu.updated_at
    FROM telegram_users tu
    WHERE NOT EXISTS (
      SELECT 1 FROM identities i
      WHERE i.resource = 'telegram' AND i.external_id = tu.telegram_id::text
    )
  LOOP
    resolved_identity_id := NULL;
    resolved_user_id := NULL;

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
      SELECT i.id, i.user_id INTO resolved_identity_id, resolved_user_id
      FROM identities i
      WHERE i.resource = 'telegram' AND i.external_id = row_data.external_id
      LIMIT 1;
    END IF;

    IF row_data.phone IS NOT NULL AND TRIM(row_data.phone) != '' THEN
      INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
      VALUES (
        resolved_user_id,
        'phone',
        TRIM(row_data.phone),
        'telegram',
        NULL,
        COALESCE(row_data.created_at, now()),
        COALESCE(row_data.updated_at, now())
      )
      ON CONFLICT (type, value_normalized)
      DO UPDATE SET user_id = EXCLUDED.user_id, label = EXCLUDED.label, updated_at = EXCLUDED.updated_at;
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
      NULL,
      false,
      false,
      false,
      NULL,
      NULL,
      true,
      COALESCE(row_data.created_at, now()),
      COALESCE(row_data.updated_at, now())
    )
    ON CONFLICT (identity_id)
    DO UPDATE SET updated_at = EXCLUDED.updated_at;
  END LOOP;
END $$;
