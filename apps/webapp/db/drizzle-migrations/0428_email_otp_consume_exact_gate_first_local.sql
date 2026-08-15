-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0428
-- 0428: keep anonymous e-mail OTP consume behind its exact pre-session capability.
--
-- 0249 initialized PL/pgSQL variables in DECLARE. Under port-context those expressions run before
-- the injected BEGIN guard, so the exact-gate verifier correctly rejects the function. Keep every
-- executable expression after the hand-written exact gate; the access reconciler may replace this
-- statement with the declaration-rendered equivalent without changing the body order.

CREATE OR REPLACE FUNCTION app.email_otp_public_consume_latest_challenge(
  p_email_normalized text,
  p_code_hash text
)
RETURNS TABLE (ok boolean, code text, user_id uuid, retry_after_seconds integer)
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_email_normalized text;
  v_now_sec bigint;
  v_challenge public.email_challenges%ROWTYPE;
  v_latest_challenge_id uuid;
  v_target_user public.platform_users%ROWTYPE;
  v_conflict_user_id uuid;
  v_next_attempts integer;
  v_allowed_purposes text[];
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.email-otp.challenge.consume',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_email_normalized))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_code_hash))::app.port_typed_arg
    ]),
    'app.email_otp_public_consume_latest_challenge(text,text)'::regprocedure
  );

  v_email_normalized := lower(btrim(p_email_normalized));
  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  v_allowed_purposes := ARRAY['login', 'public_registration', 'clinic_invite'];

  IF v_email_normalized = '' THEN
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF p_code_hash IS NULL OR btrim(p_code_hash) = '' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.platform_users AS candidate
  WHERE candidate.id IN (
    SELECT challenge.user_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
  )
  ORDER BY candidate.id
  FOR UPDATE;

  LOOP
    SELECT challenge.*
    INTO v_challenge
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
      RETURN;
    END IF;

    SELECT challenge.id
    INTO v_latest_challenge_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1;
    EXIT WHEN v_latest_challenge_id = v_challenge.id;
  END LOOP;

  SELECT platform_user.*
  INTO v_target_user
  FROM public.platform_users AS platform_user
  WHERE platform_user.id = v_challenge.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_user.merged_into_id IS NOT NULL THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.attempts >= 5 THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
    RETURN;
  END IF;

  IF v_challenge.code_hash <> p_code_hash
     OR NOT (v_challenge.purpose IS NULL OR v_challenge.purpose = ANY(v_allowed_purposes))
  THEN
    UPDATE public.email_challenges
    SET attempts = attempts + 1
    WHERE id = v_challenge.id
    RETURNING attempts::integer INTO v_next_attempts;
    IF v_next_attempts >= 5 THEN
      DELETE FROM public.email_challenges WHERE id = v_challenge.id;
      RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT conflict.id
  INTO v_conflict_user_id
  FROM public.platform_users AS conflict
  WHERE conflict.email_normalized = v_email_normalized
    AND conflict.merged_into_id IS NULL
    AND conflict.id <> v_target_user.id
  ORDER BY conflict.id
  LIMIT 1;
  IF FOUND THEN
    DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.platform_users
  SET email = v_email_normalized,
      email_normalized = v_email_normalized,
      email_verified_at = clock_timestamp()
  WHERE id = v_target_user.id;
  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$function$;

REVOKE ALL ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) FROM PUBLIC;
