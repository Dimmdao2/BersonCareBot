\set ON_ERROR_STOP on

BEGIN;

-- Preflight: accept either the exact verified source fingerprint or the complete end state.
DO $preflight$
DECLARE
  already_applied boolean;
  doctor_count bigint;
  admin_count bigint;
  fk record;
  first_admin_refs bigint;
  second_admin_refs bigint;
BEGIN
  -- Serialize the census/delete path against concurrent FK inserts that take KEY SHARE locks.
  PERFORM 1
  FROM platform_users
  WHERE id IN (
    '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
    '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
  )
  FOR UPDATE;

  SELECT
    EXISTS (
      SELECT 1
      FROM platform_users
      WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
        AND role = 'doctor'
        AND email = 'dimmdao@yandex.ru'
        AND email_normalized = 'dimmdao@yandex.ru'
        AND phone_normalized = '+79643805480'
        AND integrator_user_id = 2
        AND merged_into_id IS NULL
        AND is_archived IS FALSE
    )
    AND EXISTS (
      SELECT 1
      FROM platform_users
      WHERE role = 'admin'
        AND display_name = 'Дмитрий Берсон'
        AND email = 'dimmdao@gmail.com'
        AND email_normalized = 'dimmdao@gmail.com'
        AND phone_normalized IS NULL
        AND integrator_user_id IS NULL
        AND merged_into_id IS NULL
        AND is_archived IS FALSE
    )
    AND EXISTS (
      SELECT 1
      FROM platform_users
      WHERE id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
        AND role = 'client'
        AND email IS NULL
        AND email_normalized IS NULL
        AND phone_normalized = '+79189000782'
        AND integrator_user_id = 82
        AND merged_into_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM platform_users
      WHERE id IN (
        '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
        '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM be_appointments
      WHERE platform_user_id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
    )
  INTO already_applied;

  IF already_applied THEN
    SELECT
      count(*) FILTER (WHERE role = 'doctor'),
      count(*) FILTER (WHERE role = 'admin')
    INTO doctor_count, admin_count
    FROM platform_users
    WHERE role IN ('doctor', 'admin')
      AND merged_into_id IS NULL
      AND is_archived IS FALSE;

    IF (doctor_count, admin_count) IS DISTINCT FROM (1::bigint, 1::bigint)
      OR (SELECT count(*) FROM platform_users
          WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
            AND role = 'doctor' AND email = 'dimmdao@yandex.ru'
            AND email_normalized = 'dimmdao@yandex.ru' AND phone_normalized = '+79643805480'
            AND integrator_user_id = 2 AND merged_into_id IS NULL AND is_archived IS FALSE) <> 1
      OR (SELECT count(*) FROM platform_users
          WHERE role = 'admin' AND display_name = 'Дмитрий Берсон'
            AND email = 'dimmdao@gmail.com' AND email_normalized = 'dimmdao@gmail.com'
            AND phone_normalized IS NULL AND integrator_user_id IS NULL
            AND merged_into_id IS NULL AND is_archived IS FALSE) <> 1
      OR (SELECT count(*) FROM platform_users
          WHERE id = 'a754c977-d1cc-46bb-b870-ca499be81884'::uuid
            AND role = 'admin' AND email = 'dimmdao@yandex.ru'
            AND merged_into_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid) <> 1
      OR (SELECT count(*) FROM platform_users
          WHERE id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
            AND role = 'client' AND email IS NULL AND email_normalized IS NULL
            AND phone_normalized = '+79189000782' AND integrator_user_id = 82
            AND merged_into_id IS NULL) <> 1
      OR EXISTS (SELECT 1 FROM be_appointments
                 WHERE platform_user_id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid)
      OR EXISTS (SELECT 1 FROM user_channel_preferences
                 WHERE platform_user_id IN (
                   '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
                   '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
                 ))
    THEN
      RAISE EXCEPTION 'preflight failed: already-applied state is incomplete or drifted';
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
      AND role = 'admin'
      AND display_name = 'Дмитрий Берсон'
      AND email = 'dimmdao@gmail.com'
      AND email_normalized = 'dimmdao@gmail.com'
      AND phone_normalized = '+79643805480'
      AND integrator_user_id = 2
      AND merged_into_id IS NULL
      AND is_archived IS FALSE
  ) THEN
    RAISE EXCEPTION 'preflight failed: b0021a38 source fingerprint differs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
      AND role = 'client'
      AND email = 'dimmdao@yandex.ru'
      AND email_normalized = 'dimmdao@yandex.ru'
      AND phone_normalized = '+79189000782'
      AND integrator_user_id = 82
      AND merged_into_id IS NULL
  ) THEN
    RAISE EXCEPTION 'preflight failed: 1c312a64 source fingerprint differs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = 'a754c977-d1cc-46bb-b870-ca499be81884'::uuid
      AND role = 'admin'
      AND email = 'dimmdao@yandex.ru'
      AND merged_into_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
  ) THEN
    RAISE EXCEPTION 'preflight failed: a754c977 merged-user fingerprint differs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid
      AND role = 'admin'
      AND email IS NULL
      AND email_normalized IS NULL
      AND phone_normalized IS NULL
      AND integrator_user_id IS NULL
      AND merged_into_id IS NULL
      AND is_archived IS FALSE
  ) THEN
    RAISE EXCEPTION 'preflight failed: 9504c4b8 empty-admin fingerprint differs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
      AND role = 'admin'
      AND email IS NULL
      AND email_normalized IS NULL
      AND phone_normalized IS NULL
      AND integrator_user_id IS NULL
      AND merged_into_id IS NULL
      AND is_archived IS FALSE
  ) THEN
    RAISE EXCEPTION 'preflight failed: 2e5068fe empty-admin fingerprint differs';
  END IF;

  -- The source admin b0021a38 legitimately holds gmail here (it becomes the doctor, freeing
  -- gmail for the new admin). Only a DIFFERENT active gmail admin signals a bad/partial state.
  IF EXISTS (
    SELECT 1
    FROM platform_users
    WHERE role = 'admin'
      AND email_normalized = 'dimmdao@gmail.com'
      AND merged_into_id IS NULL
      AND id <> 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
  ) THEN
    RAISE EXCEPTION 'preflight failed: replacement active admin already exists in a partial state';
  END IF;

  IF (SELECT count(*) FROM be_appointments
      WHERE platform_user_id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid) <> 10 THEN
    RAISE EXCEPTION 'preflight failed: expected exactly 10 client appointments';
  END IF;

  IF (SELECT count(*) FROM user_channel_preferences
      WHERE platform_user_id = '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid) <> 1 THEN
    RAISE EXCEPTION 'preflight failed: expected exactly one 2e5068fe channel-preference child';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_channel_preferences
    WHERE platform_user_id = '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid
  ) OR EXISTS (
    SELECT 1
    FROM platform_users
    WHERE merged_into_id IN (
      '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
      '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'preflight failed: empty-admin child/merge-target fingerprint differs';
  END IF;

  -- Fail closed over every catalogued FK to platform_users(id). The only allowed source-state
  -- reference is the one known user_channel_preferences row for 2e5068fe, deleted explicitly below.
  FOR fk IN
    SELECT
      child_ns.nspname AS schema_name,
      child.relname AS table_name,
      child_att.attname AS column_name,
      constraint_row.conname AS constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
      AS key_pair(child_attnum, parent_attnum) ON true
    JOIN pg_attribute child_att
      ON child_att.attrelid = child.oid AND child_att.attnum = key_pair.child_attnum
    JOIN pg_attribute parent_att
      ON parent_att.attrelid = parent.oid AND parent_att.attnum = key_pair.parent_attnum
    WHERE constraint_row.contype = 'f'
      AND parent_ns.nspname = 'public'
      AND parent.relname = 'platform_users'
      AND parent_att.attname = 'id'
  LOOP
    EXECUTE format(
      'SELECT count(*) FILTER (WHERE %1$I = $1), count(*) FILTER (WHERE %1$I = $2) FROM %2$I.%3$I',
      fk.column_name, fk.schema_name, fk.table_name
    )
    INTO first_admin_refs, second_admin_refs
    USING
      '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
      '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid;

    IF fk.schema_name = 'public'
      AND fk.table_name = 'user_channel_preferences'
      AND fk.column_name = 'platform_user_id'
    THEN
      IF (first_admin_refs, second_admin_refs) IS DISTINCT FROM (0::bigint, 1::bigint) THEN
        RAISE EXCEPTION
          'preflight failed: allowed FK %.% (%) has counts (%,%), expected (0,1)',
          fk.schema_name, fk.table_name, fk.constraint_name, first_admin_refs, second_admin_refs;
      END IF;
    ELSIF first_admin_refs <> 0 OR second_admin_refs <> 0 THEN
      RAISE EXCEPTION
        'preflight failed: unexpected FK references in %.% via % (%) for empty admins: (%,%)',
        fk.schema_name, fk.table_name, fk.column_name, fk.constraint_name,
        first_admin_refs, second_admin_refs;
    END IF;
  END LOOP;
END
$preflight$;

-- 1. Free the active yandex.ru email from the surviving client.
UPDATE platform_users
SET email = NULL,
    email_normalized = NULL,
    updated_at = now()
WHERE id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
  AND email = 'dimmdao@yandex.ru'
  AND email_normalized = 'dimmdao@yandex.ru';

-- 2. Convert the known active admin into the sole doctor and move the freed email to it.
UPDATE platform_users
SET role = 'doctor',
    email = 'dimmdao@yandex.ru',
    email_normalized = 'dimmdao@yandex.ru',
    updated_at = now()
WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
  AND role = 'admin';

-- 3. Create the replacement active admin after the gmail address has been freed.
INSERT INTO platform_users (
  id,
  role,
  display_name,
  email,
  email_normalized,
  phone_normalized,
  integrator_user_id
)
SELECT
  gen_random_uuid(),
  'admin',
  'Дмитрий Берсон',
  'dimmdao@gmail.com',
  'dimmdao@gmail.com',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM platform_users
  WHERE role = 'admin'
    AND email_normalized = 'dimmdao@gmail.com'
    AND merged_into_id IS NULL
);

-- 4. Hard-delete the client's appointments; declared FK actions handle their children.
DELETE FROM be_appointments
WHERE platform_user_id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid;

-- 5. Remove the one known child, then hard-delete both verified unreferenced empty admins.
DELETE FROM user_channel_preferences
WHERE platform_user_id = '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid;

DELETE FROM platform_users
WHERE id IN (
  '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
  '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
);

-- Postflight: prove the exact staff split and every required survivor/deletion invariant.
DO $postflight$
DECLARE
  doctor_count bigint;
  admin_count bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE role = 'doctor'),
    count(*) FILTER (WHERE role = 'admin')
  INTO doctor_count, admin_count
  FROM platform_users
  WHERE role IN ('doctor', 'admin')
    AND merged_into_id IS NULL
    AND is_archived IS FALSE;

  IF (doctor_count, admin_count) IS DISTINCT FROM (1::bigint, 1::bigint) THEN
    RAISE EXCEPTION 'postflight failed: expected active doctor/admin counts (1,1), got (%,%)',
      doctor_count, admin_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
      AND role = 'doctor'
      AND email = 'dimmdao@yandex.ru'
      AND email_normalized = 'dimmdao@yandex.ru'
      AND phone_normalized = '+79643805480'
      AND integrator_user_id = 2
      AND merged_into_id IS NULL
      AND is_archived IS FALSE
  ) THEN
    RAISE EXCEPTION 'postflight failed: surviving doctor differs';
  END IF;

  IF (SELECT count(*) FROM platform_users
      WHERE role = 'admin'
        AND display_name = 'Дмитрий Берсон'
        AND email = 'dimmdao@gmail.com'
        AND email_normalized = 'dimmdao@gmail.com'
        AND phone_normalized IS NULL
        AND integrator_user_id IS NULL
        AND merged_into_id IS NULL
        AND is_archived IS FALSE) <> 1 THEN
    RAISE EXCEPTION 'postflight failed: replacement active admin is missing or duplicated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id IN (
      '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
      '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'postflight failed: empty admin rows still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = 'a754c977-d1cc-46bb-b870-ca499be81884'::uuid
      AND role = 'admin'
      AND email = 'dimmdao@yandex.ru'
      AND merged_into_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
  ) THEN
    RAISE EXCEPTION 'postflight failed: merged admin a754c977 changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform_users
    WHERE id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
      AND role = 'client'
      AND email IS NULL
      AND email_normalized IS NULL
      AND phone_normalized = '+79189000782'
      AND integrator_user_id = 82
      AND merged_into_id IS NULL
  ) THEN
    RAISE EXCEPTION 'postflight failed: surviving client differs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM be_appointments
    WHERE platform_user_id = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'::uuid
  ) THEN
    RAISE EXCEPTION 'postflight failed: client appointments still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_channel_preferences
    WHERE platform_user_id IN (
      '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
      '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'postflight failed: empty-admin channel preferences still exist';
  END IF;
END
$postflight$;

COMMIT;
