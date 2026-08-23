-- Independent B4 audit — live DEV proof, ROLLBACK-ONLY.
-- Applies migration 20260823T064034 verbatim inside one transaction, then writes real rows through
-- both new CHECK constraints, then rolls the whole thing back. Nothing is left in the database.
--
-- Run: sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
--        -v ON_ERROR_STOP=1 -f AUDIT_B4_DEV_PROOF_2026-08-23.sql
--
-- Measured 2026-08-23: VERIFY_PREDICATE=true; 9/9 malformed accents rejected by
-- org_brand_revisions_accent_token_check; '', '   ' and 121 chars rejected by
-- org_brand_revisions_patient_app_name_check; a lone tab ACCEPTED (btrim strips spaces only —
-- same as the pre-existing display_name check, see report N-7); '#1a2b3c', 120 chars and both
-- NULLs accepted.
\set ON_ERROR_STOP on
BEGIN;

-- 1. Apply the B4 migration verbatim (rollback-only).
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

-- 2. The migration's own VERIFY predicate.
SELECT 'VERIFY_PREDICATE=' || (count(*) = 2)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'org_brand_revisions'
   AND column_name IN ('patient_app_name', 'accent_token');

-- 3. Behaviour of both constraints against real writes.
DO $$
DECLARE
  v_org uuid;
  v_actor uuid;
  v_c text;
  v_out text := '';
  v_id uuid;
BEGIN
  SELECT id INTO v_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires one organization and one platform user';
  END IF;
  DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;

  -- helper closure via inline blocks; each case is its own subtransaction
  -- (a) accent outside ^#[0-9a-f]{6}$ must be refused by the DATABASE
  FOR v_c IN SELECT unnest(ARRAY['red', '#12345', '#1234567', '#ABCDEF', '#12345g', ' #123456',
                                 'rgb(1,2,3)', '#123456; background:url(x)', ''])
  LOOP
    BEGIN
      INSERT INTO public.org_brand_revisions
        (organization_id, status, accent_token, created_by_platform_user_id)
      VALUES (v_org, 'draft', v_c, v_actor);
      v_out := v_out || format('ACCENT_ACCEPTED_UNEXPECTED[%s] ', v_c);
      DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
      IF v_c <> 'org_brand_revisions_accent_token_check' THEN RAISE; END IF;
      v_out := v_out || 'accent_rejected ';
    END;
  END LOOP;

  -- (b) a normalized accent is accepted
  BEGIN
    INSERT INTO public.org_brand_revisions
      (organization_id, status, accent_token, patient_app_name, created_by_platform_user_id)
    VALUES (v_org, 'draft', '#1a2b3c', 'Приложение клиники', v_actor) RETURNING id INTO v_id;
    v_out := v_out || 'NORMALIZED_ACCENT_ACCEPTED ';
    DELETE FROM public.org_brand_revisions WHERE id = v_id;
  END;

  -- (c) empty / blank / oversized patient app name must be refused by the DATABASE
  FOR v_c IN SELECT unnest(ARRAY['', '   ', E'\t', repeat('x', 121)])
  LOOP
    BEGIN
      INSERT INTO public.org_brand_revisions
        (organization_id, status, patient_app_name, created_by_platform_user_id)
      VALUES (v_org, 'draft', v_c, v_actor);
      v_out := v_out || format('NAME_ACCEPTED_UNEXPECTED[len=%s] ', length(v_c));
      DELETE FROM public.org_brand_revisions WHERE organization_id = v_org;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
      IF v_c <> 'org_brand_revisions_patient_app_name_check' THEN RAISE; END IF;
      v_out := v_out || 'name_rejected ';
    END;
  END LOOP;

  -- (d) 120 chars exactly and NULL are accepted
  BEGIN
    INSERT INTO public.org_brand_revisions
      (organization_id, status, patient_app_name, created_by_platform_user_id)
    VALUES (v_org, 'draft', repeat('x', 120), v_actor) RETURNING id INTO v_id;
    v_out := v_out || 'NAME_120_ACCEPTED ';
    DELETE FROM public.org_brand_revisions WHERE id = v_id;
  END;
  BEGIN
    INSERT INTO public.org_brand_revisions
      (organization_id, status, patient_app_name, accent_token, created_by_platform_user_id)
    VALUES (v_org, 'draft', NULL, NULL, v_actor) RETURNING id INTO v_id;
    v_out := v_out || 'BOTH_NULL_ACCEPTED ';
    DELETE FROM public.org_brand_revisions WHERE id = v_id;
  END;

  RAISE NOTICE 'B4_RESULT: %', v_out;
END $$;

ROLLBACK;
