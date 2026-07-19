-- C2F: the public email/password registration accessor now accepts structured FIO only.
-- Existing platform_users columns are reused; display_name remains a derived compatibility projection.
DROP FUNCTION IF EXISTS app.email_password_register_pending(text, text, text, text);

CREATE FUNCTION app.email_password_register_pending(
  p_email_norm text,
  p_password_hash text,
  p_last_name text,
  p_first_name text,
  p_patronymic text,
  p_role text
)
RETURNS TABLE (ok boolean, code text, user_id uuid)
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
  v_display_name text;
  v_user_id uuid;
BEGIN
  IF p_role NOT IN ('client', 'doctor') THEN
    RETURN QUERY SELECT false, 'invalid_role'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid;
    RETURN;
  END IF;

  v_display_name := concat_ws(' ', v_last_name, v_first_name, v_patronymic);

  INSERT INTO public.platform_users (
    display_name,
    last_name,
    first_name,
    patronymic,
    email,
    email_normalized,
    role
  )
  VALUES (v_display_name, v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, p_role)
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.user_password_credentials (user_id, password_hash, updated_at)
  VALUES (v_user_id, p_password_hash, now());

  RETURN QUERY SELECT true, NULL::text, v_user_id;
END
$function$;

COMMENT ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) IS
  'Narrow SECURITY DEFINER for public structured email/password pending registration. Derives display_name and allows only client/doctor roles; no app_patient table DML grants.';

REVOKE ALL ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) TO app_patient;
