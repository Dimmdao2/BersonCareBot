-- 0256: let an established staff-security self principal replace only its own password hash.
--
-- The caller runs as app_patient and intentionally has no table privileges on
-- public.user_password_credentials. app_owner bypasses RLS, so the function accepts no user id and
-- repeats the exact self-ownership predicate in its body using the existing fail-closed principal
-- seam from 0215.

DO $staff_security_self_password_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- SELECT is required for the user_id predicate; UPDATE is required for the hash write.
    GRANT SELECT, UPDATE ON TABLE public.user_password_credentials TO app_owner;
  END IF;
END
$staff_security_self_password_owner_grants$;

CREATE OR REPLACE FUNCTION app.set_staff_security_self_password_hash(
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  -- Raises staff_security_self_principal_required when no signed self principal is established.
  v_user_id := app.require_staff_security_self_user_id();

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = p_password_hash,
      updated_at = now()
  WHERE credentials.user_id = v_user_id;

  RETURN FOUND;
END
$function$;

DO $staff_security_self_password_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.set_staff_security_self_password_hash(text) OWNER TO app_owner;
  END IF;
END
$staff_security_self_password_owner$;

REVOKE ALL ON FUNCTION app.set_staff_security_self_password_hash(text) FROM PUBLIC;

DO $staff_security_self_password_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.set_staff_security_self_password_hash(text) TO app_patient;
  END IF;
END
$staff_security_self_password_grants$;

COMMENT ON FUNCTION app.set_staff_security_self_password_hash(text) IS
  'Staff-security self action: replaces only the signed current self principal own password hash.';
