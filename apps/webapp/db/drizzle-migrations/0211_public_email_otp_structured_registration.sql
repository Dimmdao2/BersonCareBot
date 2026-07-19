-- C2F: split public email OTP login (lookup-only) from structured patient registration.
-- No table or column is added; display_name is a derived compatibility projection.
CREATE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH RECURSIVE chain AS (
    SELECT u.id, u.merged_into_id, 0 AS depth, ARRAY[u.id] AS path
    FROM public.platform_users AS u
    WHERE u.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT u.id, u.merged_into_id, chain.depth + 1, chain.path || u.id
    FROM public.platform_users AS u
    JOIN chain ON u.id = chain.merged_into_id
    WHERE chain.depth < 5 AND NOT u.id = ANY(chain.path)
  )
  SELECT chain.id
  FROM chain
  ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
  LIMIT 1
$function$;

CREATE FUNCTION app.email_otp_public_register_patient(
  p_email_norm text,
  p_last_name text,
  p_first_name text,
  p_patronymic text
)
RETURNS TABLE (ok boolean, code text, user_id uuid, was_created boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_last_name text := NULLIF(btrim(p_last_name), '');
  v_first_name text := NULLIF(btrim(p_first_name), '');
  v_patronymic text := NULLIF(btrim(p_patronymic), '');
  v_existing public.platform_users%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid, false;
    RETURN;
  END IF;

  SELECT u.* INTO v_existing
  FROM public.platform_users AS u
  WHERE u.email_normalized = v_email_norm AND u.merged_into_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.email_verified_at IS NULL
      AND v_existing.role = 'client'
      AND v_existing.last_name IS NOT NULL
      AND v_existing.first_name IS NOT NULL THEN
      -- Existing pending registration may resend, but must never overwrite its identity data.
      RETURN QUERY SELECT true, 'pending_registration'::text, v_existing.id, false;
    END IF;
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    RETURN;
  END IF;

  INSERT INTO public.platform_users (
    display_name, last_name, first_name, patronymic, email, email_normalized, role
  ) VALUES (
    concat_ws(' ', v_last_name, v_first_name, v_patronymic),
    v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, 'client'
  )
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$function$;

CREATE FUNCTION app.email_otp_public_delete_unverified_registration(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role = 'client'
    AND merged_into_id IS NULL
    AND email_verified_at IS NULL
$function$;

COMMENT ON FUNCTION app.email_otp_public_find_user_by_email(text) IS
  'Narrow SECURITY DEFINER public email-OTP login lookup; never creates platform_users.';
COMMENT ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) IS
  'Narrow SECURITY DEFINER structured public patient email registration; derives display_name and preserves pending identity FIO.';
COMMENT ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) IS
  'Narrow rollback accessor for a newly-created public email-OTP patient registration after delivery failure.';

REVOKE ALL ON FUNCTION app.email_otp_public_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) TO app_patient;
