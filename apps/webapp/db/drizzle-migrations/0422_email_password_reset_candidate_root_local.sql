-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- 0422: exact pre-session root for password-reset candidate lookup.
-- The final privilege declaration owns the seam owner/EXECUTE ACL and verifies the exact gate.

CREATE OR REPLACE FUNCTION app.email_password_find_reset_candidate(p_email_norm text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner',
    'app_pre_session',
    'pre_session',
    'auth.password.reset-candidate',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_email_norm))::app.port_typed_arg
    ]),
    'app.email_password_find_reset_candidate(text)'::regprocedure
  );
  SELECT credentials.user_id
  INTO v_user_id
  FROM public.user_password_credentials AS credentials
  INNER JOIN public.platform_users AS users ON users.id = credentials.user_id
  WHERE users.merged_into_id IS NULL
    AND users.email_normalized = lower(btrim(p_email_norm))
    AND users.email_verified_at IS NOT NULL
  LIMIT 1;
  RETURN v_user_id;
END
$$;

COMMENT ON FUNCTION app.email_password_find_reset_candidate(text) IS
  'Exact pre-session password-reset candidate lookup; returns only the verified canonical user id and never exposes a password hash.';

REVOKE ALL ON FUNCTION app.email_password_find_reset_candidate(text) FROM PUBLIC;
