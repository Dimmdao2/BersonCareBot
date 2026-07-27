-- 0252: restore two patient-facing actions without granting either caller direct table access.
--
-- Phone auth runs as the NOINHERIT bootstrap base login (it never SET ROLEs), so its five store
-- operations are granted to the dynamically discovered login by
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql. Patient LFK runs as app_patient; its
-- three read accessors re-state the organization/patient or platform-global predicate because their
-- app_owner definer bypasses RLS.

DO $patient_action_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT ON TABLE
      public.lfk_complexes,
      public.lfk_complex_exercises,
      public.lfk_complex_templates,
      public.lfk_complex_template_exercises,
      public.lfk_exercises,
      public.lfk_exercise_media
    TO app_owner;
  END IF;
END
$patient_action_owner_grants$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_upsert(
  p_challenge_id text,
  p_phone text,
  p_expires_at bigint,
  p_code text,
  p_channel_context jsonb,
  p_verify_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = ''
     OR p_phone IS NULL OR btrim(p_phone) = ''
     OR p_expires_at IS NULL OR p_expires_at <= 0
     OR p_verify_attempts IS NULL OR p_verify_attempts < 0
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.phone_challenges AS challenge (
    challenge_id,
    phone,
    expires_at,
    code,
    channel_context,
    verify_attempts
  )
  VALUES (
    p_challenge_id,
    p_phone,
    p_expires_at,
    p_code,
    p_channel_context,
    p_verify_attempts
  )
  ON CONFLICT (challenge_id) DO UPDATE
  SET phone = EXCLUDED.phone,
      expires_at = EXCLUDED.expires_at,
      code = EXCLUDED.code,
      channel_context = EXCLUDED.channel_context,
      verify_attempts = EXCLUDED.verify_attempts
  -- An opaque challenge id is the bootstrap flow's bearer capability. A collision may refresh only
  -- the same phone's row; it can never take over a challenge belonging to another phone.
  WHERE challenge.phone = EXCLUDED.phone;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_read(p_challenge_id text)
RETURNS TABLE (
  phone text,
  expires_at bigint,
  code text,
  channel_context jsonb,
  verify_attempts integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_challenge public.phone_challenges%ROWTYPE;
  v_now_sec bigint := extract(epoch FROM clock_timestamp())::bigint;
BEGIN
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN
    RETURN;
  END IF;

  SELECT challenge.*
  INTO v_challenge
  FROM public.phone_challenges AS challenge
  WHERE challenge.challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges AS challenge
    WHERE challenge.challenge_id = p_challenge_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_challenge.phone,
    v_challenge.expires_at,
    v_challenge.code,
    v_challenge.channel_context,
    v_challenge.verify_attempts::integer;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_delete(p_challenge_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN
    RETURN false;
  END IF;

  DELETE FROM public.phone_challenges AS challenge
  WHERE challenge.challenge_id = p_challenge_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_delete_by_phone(p_phone text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.phone_challenges AS challenge
  WHERE challenge.phone = p_phone;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_increment_attempts(
  p_challenge_id text,
  p_now_sec bigint
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  UPDATE public.phone_challenges AS challenge
  SET verify_attempts = challenge.verify_attempts + 1
  WHERE challenge.challenge_id = p_challenge_id
    AND challenge.expires_at > p_now_sec
  RETURNING challenge.verify_attempts::integer
$function$;

CREATE OR REPLACE FUNCTION app.read_patient_lfk_complex_cover(p_complex_id uuid)
RETURNS TABLE (
  cover_image_url text,
  cover_media_type text,
  cover_media_id uuid,
  preview_sm_key text,
  preview_md_key text,
  preview_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    media.media_url,
    media.media_type,
    file.id,
    file.preview_sm_key,
    file.preview_md_key,
    file.preview_status
  FROM public.lfk_complexes AS complex
  JOIN public.lfk_complex_exercises AS complex_exercise
    ON complex_exercise.complex_id = complex.id
   AND complex_exercise.organization_id = complex.organization_id
  JOIN public.lfk_exercise_media AS media
    ON media.exercise_id = complex_exercise.exercise_id
   AND (
     (media.owner_kind = 'platform' AND media.organization_id IS NULL)
     OR (
       media.owner_kind = 'organization'
       AND media.organization_id = complex.organization_id
     )
   )
  LEFT JOIN public.media_files AS file
    ON file.id = NULLIF(
      substring(
        btrim(media.media_url)
        FROM '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'
      ),
      ''
    )::uuid
   AND (
     (
       media.owner_kind = 'platform'
       AND file.owner_kind = 'platform'
       AND file.organization_id IS NULL
     )
     OR (
       media.owner_kind = 'organization'
       AND file.organization_id = complex.organization_id
     )
   )
  WHERE complex.id = p_complex_id
    AND app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND complex.organization_id = app.current_org_id()
    AND (
      complex.platform_user_id = app.current_patient_user_id()
      OR (
        complex.platform_user_id IS NULL
        AND complex.user_id = app.current_patient_user_id()::text
      )
    )
  ORDER BY complex_exercise.sort_order ASC, media.sort_order ASC, media.created_at ASC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.read_patient_lfk_complex_exercise_lines(p_complex_ids uuid[])
RETURNS TABLE (
  complex_id uuid,
  id uuid,
  sort_order integer,
  exercise_title text,
  comment text,
  local_comment text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    complex_exercise.complex_id,
    complex_exercise.id,
    complex_exercise.sort_order,
    COALESCE(NULLIF(btrim(exercise.title), ''), 'Упражнение'),
    complex_exercise.comment,
    complex_exercise.local_comment
  FROM public.lfk_complex_exercises AS complex_exercise
  JOIN public.lfk_complexes AS complex
    ON complex.id = complex_exercise.complex_id
   AND complex.organization_id = complex_exercise.organization_id
  JOIN public.lfk_exercises AS exercise
    ON exercise.id = complex_exercise.exercise_id
   AND (
     (exercise.owner_kind = 'platform' AND exercise.organization_id IS NULL)
     OR (
       exercise.owner_kind = 'organization'
       AND exercise.organization_id = complex.organization_id
     )
   )
  WHERE complex.id = ANY(COALESCE(p_complex_ids, ARRAY[]::uuid[]))
    AND app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND complex.organization_id = app.current_org_id()
    AND (
      complex.platform_user_id = app.current_patient_user_id()
      OR (
        complex.platform_user_id IS NULL
        AND complex.user_id = app.current_patient_user_id()::text
      )
    )
  ORDER BY complex_exercise.complex_id, complex_exercise.sort_order ASC, complex_exercise.id ASC
$function$;

CREATE OR REPLACE FUNCTION app.read_platform_lfk_media_entitlement_refs(p_media_id uuid)
RETURNS TABLE (
  item_type text,
  item_ref_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH media_exercise AS (
    SELECT DISTINCT exercise.id
    FROM public.media_files AS file
    JOIN public.lfk_exercise_media AS media
      ON media.media_url = '/api/media/' || file.id::text
     AND media.owner_kind = 'platform'
     AND media.organization_id IS NULL
    JOIN public.lfk_exercises AS exercise
      ON exercise.id = media.exercise_id
     AND exercise.owner_kind = 'platform'
     AND exercise.organization_id IS NULL
    WHERE file.id = p_media_id
      AND file.owner_kind = 'platform'
      AND file.organization_id IS NULL
      AND (file.status IS NULL OR file.status NOT IN ('pending', 'deleting', 'pending_delete'))
  )
  SELECT 'exercise'::text, media_exercise.id
  FROM media_exercise
  WHERE app.current_org_id() IS NOT NULL
  UNION
  SELECT 'lfk_complex'::text, template.id
  FROM media_exercise
  JOIN public.lfk_complex_template_exercises AS template_exercise
    ON template_exercise.exercise_id = media_exercise.id
  JOIN public.lfk_complex_templates AS template
    ON template.id = template_exercise.template_id
  WHERE app.current_org_id() IS NOT NULL
    AND (
      (
        template.owner_kind = 'platform'
        AND template.organization_id IS NULL
        AND template_exercise.owner_kind = 'platform'
        AND template_exercise.organization_id IS NULL
      )
      OR (
        template.owner_kind = 'organization'
        AND template.organization_id = app.current_org_id()
        AND template_exercise.owner_kind = 'organization'
        AND template_exercise.organization_id = app.current_org_id()
      )
    )
$function$;

DO $patient_action_accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer) OWNER TO app_owner;
    ALTER FUNCTION app.phone_challenge_store_read(text) OWNER TO app_owner;
    ALTER FUNCTION app.phone_challenge_store_delete(text) OWNER TO app_owner;
    ALTER FUNCTION app.phone_challenge_store_delete_by_phone(text) OWNER TO app_owner;
    ALTER FUNCTION app.phone_challenge_store_increment_attempts(text, bigint) OWNER TO app_owner;
    ALTER FUNCTION app.read_patient_lfk_complex_cover(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.read_patient_lfk_complex_exercise_lines(uuid[]) OWNER TO app_owner;
    ALTER FUNCTION app.read_platform_lfk_media_entitlement_refs(uuid) OWNER TO app_owner;
  END IF;
END
$patient_action_accessor_owner$;

REVOKE ALL ON FUNCTION app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.phone_challenge_store_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.phone_challenge_store_delete(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.phone_challenge_store_delete_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.phone_challenge_store_increment_attempts(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_patient_lfk_complex_cover(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_patient_lfk_complex_exercise_lines(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_platform_lfk_media_entitlement_refs(uuid) FROM PUBLIC;

DO $patient_lfk_accessor_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.read_patient_lfk_complex_cover(uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.read_patient_lfk_complex_exercise_lines(uuid[]) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.read_platform_lfk_media_entitlement_refs(uuid) TO app_patient;
  END IF;
  -- This shared media entitlement repository is also used by authenticated staff. Staff already has
  -- the underlying SELECTs; this grant preserves that existing caller while the repository uses one seam.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT EXECUTE ON FUNCTION app.read_platform_lfk_media_entitlement_refs(uuid) TO app_staff;
  END IF;
END
$patient_lfk_accessor_grants$;

COMMENT ON FUNCTION app.phone_challenge_store_read(text) IS
  'Bootstrap phone-auth bearer read: returns only the exact opaque challenge id supplied; never scans phone_challenges.';
COMMENT ON FUNCTION app.read_patient_lfk_complex_cover(uuid) IS
  'Patient LFK cover read: exact current organization + current patient complex only.';
COMMENT ON FUNCTION app.read_patient_lfk_complex_exercise_lines(uuid[]) IS
  'Patient LFK lines read: requested complex ids intersected with exact current organization + patient ownership.';
COMMENT ON FUNCTION app.read_platform_lfk_media_entitlement_refs(uuid) IS
  'Platform LFK media mapping: exact platform/global media plus exercise and current-org-valid complex-template entitlement refs only.';
