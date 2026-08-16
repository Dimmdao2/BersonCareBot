-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.current_patient_lfk_sessions(
  p_action text,
  p_payload text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_payload jsonb := COALESCE(NULLIF(p_payload, ''), '{}')::jsonb;
  v_result jsonb;
  v_limit integer;
  v_session_id uuid;
  v_complex_id uuid;
  v_completed_at timestamptz;
  v_recorded_at timestamptz;
  v_duration_minutes smallint;
  v_difficulty smallint;
  v_pain smallint;
  v_comment text;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'patient_context_required');
  END IF;

  IF p_action = 'list' THEN
    v_limit := LEAST(GREATEST(COALESCE((v_payload ->> 'limit')::integer, 50), 1), 5000);
    SELECT jsonb_build_object(
      'ok', true,
      'sessions', COALESCE(jsonb_agg(row_payload ORDER BY completed_at DESC), '[]'::jsonb)
    )
    INTO v_result
    FROM (
      SELECT to_jsonb(session_row) || jsonb_build_object('complex_title', complex_row.title) AS row_payload,
             session_row.completed_at
      FROM public.lfk_sessions AS session_row
      INNER JOIN public.lfk_complexes AS complex_row ON complex_row.id = session_row.complex_id
      WHERE session_row.organization_id = v_org
        AND session_row.user_id = v_patient
        AND complex_row.organization_id = v_org
        AND complex_row.platform_user_id = v_patient
      ORDER BY session_row.completed_at DESC
      LIMIT v_limit
    ) AS owned_sessions;
    RETURN v_result;
  END IF;

  IF p_action = 'list_range' THEN
    v_limit := LEAST(GREATEST(COALESCE((v_payload ->> 'limit')::integer, 2000), 1), 5000);
    v_complex_id := NULLIF(v_payload ->> 'complex_id', '')::uuid;
    SELECT jsonb_build_object(
      'ok', true,
      'sessions', COALESCE(jsonb_agg(row_payload ORDER BY completed_at DESC), '[]'::jsonb)
    )
    INTO v_result
    FROM (
      SELECT to_jsonb(session_row) || jsonb_build_object('complex_title', complex_row.title) AS row_payload,
             session_row.completed_at
      FROM public.lfk_sessions AS session_row
      INNER JOIN public.lfk_complexes AS complex_row ON complex_row.id = session_row.complex_id
      WHERE session_row.organization_id = v_org
        AND session_row.user_id = v_patient
        AND complex_row.organization_id = v_org
        AND complex_row.platform_user_id = v_patient
        AND session_row.completed_at >= (v_payload ->> 'from_completed_at')::timestamptz
        AND session_row.completed_at < (v_payload ->> 'to_completed_at_exclusive')::timestamptz
        AND (v_complex_id IS NULL OR session_row.complex_id = v_complex_id)
      ORDER BY session_row.completed_at DESC
      LIMIT v_limit
    ) AS owned_sessions;
    RETURN v_result;
  END IF;

  IF p_action = 'min_completed_at' THEN
    SELECT jsonb_build_object('ok', true, 'completed_at', MIN(session_row.completed_at))
    INTO v_result
    FROM public.lfk_sessions AS session_row
    INNER JOIN public.lfk_complexes AS complex_row ON complex_row.id = session_row.complex_id
    WHERE session_row.organization_id = v_org
      AND session_row.user_id = v_patient
      AND complex_row.organization_id = v_org
      AND complex_row.platform_user_id = v_patient;
    RETURN v_result;
  END IF;

  IF p_action = 'get' THEN
    v_session_id := NULLIF(v_payload ->> 'session_id', '')::uuid;
    SELECT jsonb_build_object(
      'ok', true,
      'session', to_jsonb(session_row) || jsonb_build_object('complex_title', complex_row.title)
    )
    INTO v_result
    FROM public.lfk_sessions AS session_row
    INNER JOIN public.lfk_complexes AS complex_row ON complex_row.id = session_row.complex_id
    WHERE session_row.id = v_session_id
      AND session_row.organization_id = v_org
      AND session_row.user_id = v_patient
      AND complex_row.organization_id = v_org
      AND complex_row.platform_user_id = v_patient;
    RETURN COALESCE(v_result, jsonb_build_object('ok', true, 'session', NULL));
  END IF;

  IF p_action = 'create' THEN
    v_complex_id := NULLIF(v_payload ->> 'complex_id', '')::uuid;
    v_completed_at := (v_payload ->> 'completed_at')::timestamptz;
    v_recorded_at := COALESCE(NULLIF(v_payload ->> 'recorded_at', '')::timestamptz, v_completed_at);
    v_duration_minutes := NULLIF(v_payload ->> 'duration_minutes', '')::smallint;
    v_difficulty := NULLIF(v_payload ->> 'difficulty_0_10', '')::smallint;
    v_pain := NULLIF(v_payload ->> 'pain_0_10', '')::smallint;
    v_comment := NULLIF(LEFT(TRIM(COALESCE(v_payload ->> 'comment', '')), 200), '');

    IF NOT EXISTS (
      SELECT 1
      FROM public.lfk_complexes AS complex_row
      WHERE complex_row.id = v_complex_id
        AND complex_row.organization_id = v_org
        AND complex_row.platform_user_id = v_patient
        AND complex_row.is_active = true
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'complex_not_found');
    END IF;

    INSERT INTO public.lfk_sessions (
      organization_id, user_id, complex_id, completed_at, source, recorded_at,
      duration_minutes, difficulty_0_10, pain_0_10, comment
    )
    VALUES (
      v_org, v_patient, v_complex_id, v_completed_at, 'webapp', v_recorded_at,
      v_duration_minutes, v_difficulty, v_pain, v_comment
    )
    RETURNING jsonb_build_object('ok', true, 'session', to_jsonb(lfk_sessions.*)) INTO v_result;
    RETURN v_result;
  END IF;

  IF p_action = 'update' THEN
    v_session_id := NULLIF(v_payload ->> 'session_id', '')::uuid;
    v_completed_at := (v_payload ->> 'completed_at')::timestamptz;
    v_duration_minutes := NULLIF(v_payload ->> 'duration_minutes', '')::smallint;
    v_difficulty := NULLIF(v_payload ->> 'difficulty_0_10', '')::smallint;
    v_pain := NULLIF(v_payload ->> 'pain_0_10', '')::smallint;
    v_comment := NULLIF(LEFT(TRIM(COALESCE(v_payload ->> 'comment', '')), 200), '');

    UPDATE public.lfk_sessions AS session_row
    SET completed_at = v_completed_at,
        duration_minutes = v_duration_minutes,
        difficulty_0_10 = v_difficulty,
        pain_0_10 = v_pain,
        comment = v_comment
    FROM public.lfk_complexes AS complex_row
    WHERE session_row.id = v_session_id
      AND session_row.organization_id = v_org
      AND session_row.user_id = v_patient
      AND complex_row.id = session_row.complex_id
      AND complex_row.organization_id = v_org
      AND complex_row.platform_user_id = v_patient
    RETURNING jsonb_build_object('ok', true, 'updated', true) INTO v_result;
    RETURN COALESCE(v_result, jsonb_build_object('ok', true, 'updated', false));
  END IF;

  IF p_action = 'delete' THEN
    v_session_id := NULLIF(v_payload ->> 'session_id', '')::uuid;
    DELETE FROM public.lfk_sessions AS session_row
    USING public.lfk_complexes AS complex_row
    WHERE session_row.id = v_session_id
      AND session_row.organization_id = v_org
      AND session_row.user_id = v_patient
      AND complex_row.id = session_row.complex_id
      AND complex_row.organization_id = v_org
      AND complex_row.platform_user_id = v_patient
    RETURNING jsonb_build_object('ok', true, 'deleted', true) INTO v_result;
    RETURN COALESCE(v_result, jsonb_build_object('ok', true, 'deleted', false));
  END IF;

  RAISE EXCEPTION 'unsupported current patient LFK session action: %', p_action
    USING ERRCODE = '22023';
END
$function$;
