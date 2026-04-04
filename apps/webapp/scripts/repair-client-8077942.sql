-- One-time data repair: create platform_users for client from Rubitime record 8077942.
-- Phone +79119975939 exists in appointment_records but has no platform_users row,
-- causing "Неизвестный клиент" in the doctor's schedule UI.
--
-- Run against WEBAPP database:
--   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/webapp/scripts/repair-client-8077942.sql

BEGIN;

-- Step 1: check if user already exists (idempotent)
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM platform_users
  WHERE phone_normalized = '+79119975939';

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'platform_users row already exists: %', v_user_id;
  ELSE
    INSERT INTO platform_users (phone_normalized, display_name, email)
    VALUES ('+79119975939', 'Карина Викторовна Прокопенкова', 'Doktorevich@bk.ru')
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created platform_users row: %', v_user_id;
  END IF;
END $$;

-- Step 2: verify the join now works
SELECT
  ar.integrator_record_id,
  ar.phone_normalized,
  ar.record_at AT TIME ZONE 'Europe/Moscow' AS record_at_moscow,
  pu.id AS platform_user_id,
  pu.display_name
FROM appointment_records ar
JOIN platform_users pu ON pu.phone_normalized = ar.phone_normalized
WHERE ar.integrator_record_id = '8077942';

COMMIT;
