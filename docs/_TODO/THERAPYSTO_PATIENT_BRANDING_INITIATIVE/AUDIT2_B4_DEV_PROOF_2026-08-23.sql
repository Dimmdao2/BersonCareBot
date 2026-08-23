-- Closing B4 audit (round 2) — live DEV proof, ROLLBACK-ONLY.
-- Applies migration 20260823T064034 verbatim, then ALSO applies the two column GRANT statements
-- the privileges artifact renders for this table, then exercises both CHECK constraints with
-- values chosen independently of round 1, then rolls everything back.
\set ON_ERROR_STOP on
BEGIN;

SELECT 'COLUMNS_BEFORE=' || count(*)::text
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='org_brand_revisions'
   AND column_name IN ('patient_app_name','accent_token');

-- 1. Migration verbatim.
ALTER TABLE public.org_brand_revisions
  ADD COLUMN patient_app_name text,
  ADD COLUMN accent_token text,
  ADD CONSTRAINT org_brand_revisions_patient_app_name_check
    CHECK (
      patient_app_name IS NULL
      OR (btrim(patient_app_name) <> '' AND length(patient_app_name) <= 120)
    ),
  ADD CONSTRAINT org_brand_revisions_accent_token_check
    CHECK (accent_token IS NULL OR accent_token ~ '^#[0-9a-f]{6}$');

SELECT 'VERIFY_PREDICATE=' || (count(*) = 2)::text
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='org_brand_revisions'
   AND column_name IN ('patient_app_name','accent_token');

-- 2. The privileges artifact for this table, applied on the migrated shape.
GRANT INSERT ("accent_token", "created_by_platform_user_id", "display_name", "logo_media_id", "organization_id", "patient_app_name", "status") ON TABLE "public"."org_brand_revisions" TO "app_staff";
GRANT UPDATE ("accent_token", "archived_at", "archived_by_platform_user_id", "display_name", "logo_media_id", "patient_app_name", "published_at", "published_by_platform_user_id", "status", "updated_at") ON TABLE "public"."org_brand_revisions" TO "app_staff";

SELECT 'STAFF_INSERT_COLS=' || string_agg(column_name, ',' ORDER BY column_name)
  FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name='org_brand_revisions'
   AND grantee='app_staff' AND privilege_type='INSERT';

SELECT 'PATIENT_TABLE_SELECT=' || string_agg(privilege_type, ',' ORDER BY privilege_type)
  FROM information_schema.table_privileges
 WHERE table_schema='public' AND table_name='org_brand_revisions' AND grantee='app_patient';

SELECT 'PATIENT_COLUMN_SELECT_ON_NEW_COLS=' || count(*)::text
  FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name='org_brand_revisions'
   AND grantee='app_patient' AND privilege_type='SELECT'
   AND column_name IN ('patient_app_name','accent_token');

SELECT 'PATIENT_SELECT_POLICY_PUBLISHED_ONLY=' ||
       (position('status = ''published''' in pg_get_expr(pol.polqual, pol.polrelid)) > 0)::text
  FROM pg_policy pol
 WHERE pol.polrelid = 'public.org_brand_revisions'::regclass
   AND pol.polname = 'rev10_org_brand_revision_select_129';

-- 3. Behaviour of both constraints against real writes, my own values.
DO $$
DECLARE
  v_org uuid; v_actor uuid; v_c text; v_out text := '';
BEGIN
  SELECT id INTO v_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires one organization and one platform user';
  END IF;
  DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;

  FOR v_c IN SELECT unnest(ARRAY[
      '#A1B2C3',                    -- uppercase: app lowercases, DB must refuse raw
      '#12ab',                      -- too short
      '#1234567',                   -- too long
      'rgb(255,0,0)',               -- css function
      '#1234 56',                   -- inner space
      '#123456'||chr(10),           -- trailing newline (CSS break-out probe)
      chr(10)||'#123456',           -- leading newline
      '#123456}body{display:none',  -- css rule break-out
      'var(--x)',                   -- css var
      '＃123456'                     -- fullwidth hash
    ])
  LOOP
    BEGIN
      INSERT INTO public.org_brand_revisions
        (organization_id, status, accent_token, created_by_platform_user_id)
      VALUES (v_org, 'draft', v_c, v_actor);
      v_out := v_out || format('ACCENT_ACCEPTED_UNEXPECTED[%L] ', v_c);
      DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;
    EXCEPTION WHEN check_violation THEN
      v_out := v_out || 'x';
    END;
  END LOOP;
  RAISE NOTICE 'ACCENT_REJECTED_10 = %', v_out;

  v_out := '';
  FOR v_c IN SELECT unnest(ARRAY[
      '',                           -- empty
      '   ',                        -- spaces only
      chr(9)||chr(9),               -- tabs only
      repeat('я', 121)              -- 121 chars
    ])
  LOOP
    BEGIN
      INSERT INTO public.org_brand_revisions
        (organization_id, status, patient_app_name, created_by_platform_user_id)
      VALUES (v_org, 'draft', v_c, v_actor);
      v_out := v_out || format('NAME_ACCEPTED_UNEXPECTED[%L] ', v_c);
      DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;
    EXCEPTION WHEN check_violation THEN
      v_out := v_out || 'x';
    END;
  END LOOP;
  RAISE NOTICE 'NAME_REJECTED_4 = %', v_out;

  -- Legitimate values must pass.
  INSERT INTO public.org_brand_revisions
    (organization_id, status, display_name, patient_app_name, accent_token, created_by_platform_user_id)
  VALUES (v_org, 'draft', 'Клиника «Здоровье»', 'Здоровье — кабинет', '#a1b2c3', v_actor);
  RAISE NOTICE 'LEGIT_ROW_ACCEPTED = %',
    (SELECT patient_app_name || ' / ' || accent_token
       FROM public.org_brand_revisions WHERE organization_id = v_org);
  DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;

  -- Both NULL must pass (the columns are optional).
  INSERT INTO public.org_brand_revisions
    (organization_id, status, created_by_platform_user_id)
  VALUES (v_org, 'draft', v_actor);
  RAISE NOTICE 'BOTH_NULL_ACCEPTED = %',
    (SELECT (patient_app_name IS NULL AND accent_token IS NULL)::text
       FROM public.org_brand_revisions WHERE organization_id = v_org);
END $$;

ROLLBACK;

-- 4. Nothing left behind.
SELECT 'COLUMNS_AFTER_ROLLBACK=' || count(*)::text
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='org_brand_revisions'
   AND column_name IN ('patient_app_name','accent_token');
