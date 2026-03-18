-- 0011_backfill_identities_from_telegram_users.sql
-- Backfill users/identities/contacts/telegram_state for any telegram_users row
-- that does not yet have a corresponding identity (e.g. added after 0009 or 0009 ran with partial data).
-- Idempotent: only inserts missing rows.

DO $$
DECLARE
  row_data RECORD;
  resolved_identity_id BIGINT;
  resolved_user_id BIGINT;
BEGIN
  FOR row_data IN
    SELECT
      tu.id AS telegram_users_id,
      tu.telegram_id::text AS external_id,
      tu.username,
      tu.first_name,
      tu.last_name,
      tu.state,
      tu.phone,
      tu.notify_spb,
      tu.notify_msk,
      tu.notify_online,
      tu.last_update_id,
      tu.last_start_at,
      tu.is_active,
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
