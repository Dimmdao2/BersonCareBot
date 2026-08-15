-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0429
-- 0429: make every remaining public e-mail OTP root exact-gate-first.

CREATE OR REPLACE FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(
  p_email_norm text
)
RETURNS TABLE (last_sent_at timestamptz)
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.email-otp.cooldown.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_email_norm))::app.port_typed_arg
    ]),
    'app.email_otp_public_find_email_send_cooldown_by_email(text)'::regprocedure
  );

  RETURN QUERY
  SELECT cooldown.last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.email_normalized = p_email_norm
  ORDER BY cooldown.last_sent_at DESC
  LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.email-otp.user.find',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_email_norm))::app.port_typed_arg
    ]),
    'app.email_otp_public_find_user_by_email(text)'::regprocedure
  );

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT platform_user.id, platform_user.merged_into_id, 0 AS depth,
           ARRAY[platform_user.id] AS path
    FROM public.platform_users AS platform_user
    WHERE platform_user.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT platform_user.id, platform_user.merged_into_id, chain.depth + 1,
           chain.path || platform_user.id
    FROM public.platform_users AS platform_user
    JOIN chain ON platform_user.id = chain.merged_into_id
    WHERE chain.depth < 5 AND NOT platform_user.id = ANY(chain.path)
  )
  SELECT chain.id
  FROM chain
  ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
  LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_or_create_user(p_email_norm text)
RETURNS TABLE (user_id uuid, was_created boolean)
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_existing_id uuid;
  v_merged_id uuid;
  v_canonical_id uuid;
  v_inserted_id uuid;
  v_display_name text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.email-otp.user.find-or-create',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_email_norm))::app.port_typed_arg
    ]),
    'app.email_otp_public_find_or_create_user(text)'::regprocedure
  );

  v_display_name := COALESCE(NULLIF(split_part(p_email_norm, '@', 1), ''), p_email_norm);

  SELECT platform_user.id
  INTO v_existing_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_merged_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NOT NULL
  ORDER BY platform_user.created_at ASC
  LIMIT 1;

  IF v_merged_id IS NOT NULL THEN
    WITH RECURSIVE chain AS (
      SELECT platform_user.id, platform_user.merged_into_id, 0 AS depth,
             ARRAY[platform_user.id] AS path
      FROM public.platform_users AS platform_user
      WHERE platform_user.id = v_merged_id
      UNION ALL
      SELECT platform_user.id, platform_user.merged_into_id, chain.depth + 1,
             chain.path || platform_user.id
      FROM public.platform_users AS platform_user
      JOIN chain ON platform_user.id = chain.merged_into_id
      WHERE chain.depth < 5 AND NOT platform_user.id = ANY(chain.path)
    )
    SELECT chain.id
    INTO v_canonical_id
    FROM chain
    ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
    LIMIT 1;

    IF v_canonical_id IS NOT NULL THEN
      RETURN QUERY SELECT v_canonical_id, false;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.platform_users (email, email_normalized, display_name, role)
  VALUES (p_email_norm, p_email_norm, v_display_name, 'client')
  ON CONFLICT (email_normalized)
    WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_existing_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'email_otp_public_find_or_create_user_failed';
  END IF;
  RETURN QUERY SELECT v_existing_id, false;
END
$function$;

CREATE OR REPLACE FUNCTION app.email_otp_public_register_patient(
  p_email_norm text,
  p_last_name text,
  p_first_name text,
  p_patronymic text
)
RETURNS TABLE (ok boolean, code text, user_id uuid, was_created boolean)
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_email_norm text;
  v_last_name text;
  v_first_name text;
  v_patronymic text;
  v_existing public.platform_users%ROWTYPE;
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.email-otp.registration.create',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_email_norm))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_last_name))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_first_name))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_patronymic))::app.port_typed_arg
    ]),
    'app.email_otp_public_register_patient(text,text,text,text)'::regprocedure
  );

  v_email_norm := lower(btrim(p_email_norm));
  v_last_name := NULLIF(btrim(p_last_name), '');
  v_first_name := NULLIF(btrim(p_first_name), '');
  v_patronymic := NULLIF(btrim(p_patronymic), '');

  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid, false;
    RETURN;
  END IF;

  SELECT platform_user.*
  INTO v_existing
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = v_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.email_verified_at IS NULL
      AND v_existing.role = 'client'
      AND v_existing.last_name IS NOT NULL
      AND v_existing.first_name IS NOT NULL
    THEN
      RETURN QUERY SELECT true, 'pending_registration'::text, v_existing.id, false;
    ELSE
      RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.platform_users (
    display_name, last_name, first_name, patronymic, email, email_normalized, role
  ) VALUES (
    concat_ws(' ', v_last_name, v_first_name, v_patronymic),
    v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, 'client'
  )
  ON CONFLICT (email_normalized)
    WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$function$;

REVOKE ALL ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_or_create_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) FROM PUBLIC;
