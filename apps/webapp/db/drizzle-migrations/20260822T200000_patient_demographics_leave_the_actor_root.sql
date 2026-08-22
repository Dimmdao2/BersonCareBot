-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 4 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'doctor_patient_support' AND column_name IN ('height_cm','weight_kg','gender','birth_date')) AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_users' AND column_name IN ('height_cm','weight_kg','gender','birth_date')) AND pg_catalog.pg_get_functiondef('app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure) NOT LIKE '%person.birth_date%' AND pg_catalog.pg_get_functiondef('app.pre_session_phone_confirm_resolve(text,text,boolean,text)'::regprocedure) NOT LIKE '%birth_date = EXCLUDED.birth_date%' AND pg_catalog.pg_get_functiondef('app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)'::regprocedure) NOT LIKE '%birth_date = EXCLUDED.birth_date%' AND pg_catalog.pg_get_functiondef('app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure) NOT LIKE '%identity.birth_date IS NULL%'
-- D15b/7a Ш9: one existing clinical profile carries patient demographics.  No table or policy is
-- introduced here: `doctor_patient_support` is already class P, FORCE RLS, current-clinic scoped,
-- patient-self readable, and one row per patient.  Privileges and policies remain declaration-owned.
ALTER TABLE public.doctor_patient_support
  ADD COLUMN height_cm integer,
  ADD COLUMN weight_kg integer,
  ADD COLUMN gender text,
  ADD COLUMN birth_date date,
  ADD CONSTRAINT doctor_patient_support_gender_check
    CHECK (gender IS NULL OR gender = ANY (ARRAY['male'::text, 'female'::text]));
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Preserve every non-null actor-root value before the old columns disappear.  `user_identity` is
-- consulted only for the already-live birth-date mirror: a disagreement is refused rather than
-- silently choosing one copy.  The existing profile organization wins; otherwise the one active
-- (then invited) enrollment supplies the already-established tenant wall.
DO $d15b7a_patient_demographics_backfill$
DECLARE
  v_height_before bigint;
  v_weight_before bigint;
  v_gender_before bigint;
  v_birth_before bigint;
  v_height_after bigint;
  v_weight_after bigint;
  v_gender_after bigint;
  v_birth_after bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_users AS person
    LEFT JOIN public.user_identity AS identity ON identity.platform_user_id = person.id
    WHERE person.role IS DISTINCT FROM 'client'
      AND (
        person.height_cm IS NOT NULL
        OR person.weight_kg IS NOT NULL
        OR person.gender IS NOT NULL
        OR COALESCE(identity.birth_date, person.birth_date) IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'patient demographics exist on a non-client actor; refusing lossy clinical move';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_users AS person
    JOIN public.user_identity AS identity ON identity.platform_user_id = person.id
    WHERE person.birth_date IS NOT NULL
      AND identity.birth_date IS NOT NULL
      AND person.birth_date IS DISTINCT FROM identity.birth_date
  ) THEN
    RAISE EXCEPTION 'patient birth-date mirrors disagree; refusing lossy actor-to-subject move';
  END IF;

  SELECT count(height_cm), count(weight_kg), count(gender), count(COALESCE(identity.birth_date, person.birth_date))
    INTO v_height_before, v_weight_before, v_gender_before, v_birth_before
  FROM public.platform_users AS person
  LEFT JOIN public.user_identity AS identity ON identity.platform_user_id = person.id;

  INSERT INTO public.doctor_patient_support AS clinical_profile (
    organization_id,
    patient_user_id,
    height_cm,
    weight_kg,
    gender,
    birth_date,
    updated_at
  )
  SELECT
    COALESCE(
      existing_profile.organization_id,
      (
        SELECT enrollment.organization_id
        FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = person.id
          AND enrollment.status IN ('active', 'invited')
        ORDER BY (enrollment.status = 'active') DESC, enrollment.organization_id
        LIMIT 1
      )
    ),
    person.id,
    person.height_cm,
    person.weight_kg,
    person.gender,
    COALESCE(identity.birth_date, person.birth_date),
    now()
  FROM public.platform_users AS person
  LEFT JOIN public.user_identity AS identity ON identity.platform_user_id = person.id
  LEFT JOIN public.doctor_patient_support AS existing_profile
    ON existing_profile.patient_user_id = person.id
  WHERE person.role = 'client'
    AND (
      person.height_cm IS NOT NULL
      OR person.weight_kg IS NOT NULL
      OR person.gender IS NOT NULL
      OR COALESCE(identity.birth_date, person.birth_date) IS NOT NULL
    )
  ON CONFLICT (patient_user_id) DO UPDATE SET
    height_cm = EXCLUDED.height_cm,
    weight_kg = EXCLUDED.weight_kg,
    gender = EXCLUDED.gender,
    birth_date = EXCLUDED.birth_date,
    updated_at = EXCLUDED.updated_at;

  IF EXISTS (
    SELECT 1
    FROM public.doctor_patient_support
    WHERE organization_id IS NULL
      AND (height_cm IS NOT NULL OR weight_kg IS NOT NULL OR gender IS NOT NULL OR birth_date IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'patient demographics have no clinic tenant key; refusing unscoped clinical row';
  END IF;

  SELECT count(height_cm), count(weight_kg), count(gender), count(birth_date)
    INTO v_height_after, v_weight_after, v_gender_after, v_birth_after
  FROM public.doctor_patient_support;

  IF (v_height_before, v_weight_before, v_gender_before, v_birth_before)
     IS DISTINCT FROM (v_height_after, v_weight_after, v_gender_after, v_birth_after) THEN
    RAISE EXCEPTION
      'patient demographic backfill count mismatch: before=(%,%,%,%), after=(%,%,%,%)',
      v_height_before, v_weight_before, v_gender_before, v_birth_before,
      v_height_after, v_weight_after, v_gender_after, v_birth_after;
  END IF;

  RAISE NOTICE 'D15b/7a Ш9 backfill counts: height_cm=%, weight_kg=%, gender=%, birth_date=%',
    v_height_after, v_weight_after, v_gender_after, v_birth_after;
END
$d15b7a_patient_demographics_backfill$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The public-booking root mirrors only account identity after this step; clinical birth date has
-- one writer and one reader in `doctor_patient_support`.
DO $d15b7a_public_booking_identity_projection$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure
  ) INTO v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    'platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at',
    'platform_user_id, first_name, last_name, patronymic, display_name, updated_at'
  );
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    'COALESCE(person.display_name, ''''), person.birth_date, now()',
    'COALESCE(person.display_name, ''''), now()'
  );
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    E'    birth_date = EXCLUDED.birth_date,\n',
    ''
  );
  IF v_rewritten = v_definition OR v_rewritten LIKE '%person.birth_date%'
     OR v_rewritten LIKE '%birth_date = EXCLUDED.birth_date%' THEN
    RAISE EXCEPTION 'public-booking identity projection rewrite did not remove actor birth_date';
  END IF;
  EXECUTE v_rewritten;
END
$d15b7a_public_booking_identity_projection$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
DO $d15b7a_phone_identity_projection$
DECLARE
  v_identity regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  FOREACH v_identity IN ARRAY ARRAY[
    'app.pre_session_phone_confirm_resolve(text,text,boolean,text)'::regprocedure,
    'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)'::regprocedure
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;
    v_rewritten := pg_catalog.replace(
      v_definition,
      'platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at',
      'platform_user_id, first_name, last_name, patronymic, display_name, updated_at'
    );
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'COALESCE(display_name, ''''), birth_date, now()',
      'COALESCE(display_name, ''''), now()'
    );
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      E'    birth_date = EXCLUDED.birth_date,\n',
      ''
    );
    IF v_rewritten = v_definition OR v_rewritten LIKE '%birth_date = EXCLUDED.birth_date%'
       OR v_rewritten LIKE '%COALESCE(display_name, ''''), birth_date, now()%' THEN
      RAISE EXCEPTION 'pre-session identity projection rewrite failed for %', v_identity;
    END IF;
    EXECUTE v_rewritten;
  END LOOP;
END
$d15b7a_phone_identity_projection$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- An account carrying patient demographics is not an empty merge shell.  The old test named only
-- `user_identity.birth_date`; after the move it must inspect all four clinical fields at their one
-- canonical location or a messenger bind could merge away a real patient's data.
DO $d15b7a_phone_binding_empty_patient$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    '      AND identity.birth_date IS NULL',
    E'      AND NOT EXISTS (\n'
      || E'        SELECT 1\n'
      || E'        FROM public.doctor_patient_support AS clinical_profile\n'
      || E'        WHERE clinical_profile.patient_user_id = source.id\n'
      || E'          AND (clinical_profile.height_cm IS NOT NULL\n'
      || E'            OR clinical_profile.weight_kg IS NOT NULL\n'
      || E'            OR clinical_profile.gender IS NOT NULL\n'
      || E'            OR clinical_profile.birth_date IS NOT NULL)\n'
      || E'      )'
  );
  IF v_rewritten = v_definition OR v_rewritten LIKE '%identity.birth_date IS NULL%'
     OR v_rewritten NOT LIKE '%clinical_profile.height_cm IS NOT NULL%' THEN
    RAISE EXCEPTION 'phone-binding empty-patient guard rewrite failed';
  END IF;
  EXECUTE v_rewritten;
END
$d15b7a_phone_binding_empty_patient$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.platform_users
  DROP COLUMN height_cm,
  DROP COLUMN weight_kg,
  DROP COLUMN gender,
  DROP COLUMN birth_date;
