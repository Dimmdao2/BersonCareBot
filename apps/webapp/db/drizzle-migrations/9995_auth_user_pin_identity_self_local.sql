-- TEMPORARY LOCAL MIGRATION NUMBER 9995. The integrator assigns the final number and journal entry.
-- Authenticated /api/me and PIN setup run under the signed identity-self app_patient principal.
-- Keep bootstrap login accessors that accept a server-resolved UUID unchanged; these capabilities
-- accept no target user and derive the only readable/writable row from the signed DB principal.

DO $auth_user_pin_self_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_pins TO app_owner;
  END IF;
END
$auth_user_pin_self_owner_grants$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_read_self()
RETURNS TABLE (
  user_id uuid,
  pin_hash text,
  attempts_failed integer,
  locked_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT pin.user_id, pin.pin_hash, pin.attempts_failed::integer, pin.locked_until
  FROM public.user_pins AS pin
  WHERE pin.user_id = app.require_staff_security_self_user_id()
$function$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_upsert_self(p_pin_hash text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_pin_hash IS NULL OR btrim(p_pin_hash) = '' THEN
    RETURN false;
  END IF;

  v_user_id := app.require_staff_security_self_user_id();

  INSERT INTO public.user_pins AS pin (
    user_id,
    pin_hash,
    attempts_failed,
    locked_until,
    updated_at
  )
  VALUES (v_user_id, p_pin_hash, 0, NULL, statement_timestamp())
  ON CONFLICT (user_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      attempts_failed = 0,
      locked_until = NULL,
      updated_at = statement_timestamp()
  WHERE pin.user_id = v_user_id;

  RETURN FOUND;
END
$function$;

DO $auth_user_pin_self_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.auth_user_pin_read_self() OWNER TO app_owner;
    ALTER FUNCTION app.auth_user_pin_upsert_self(text) OWNER TO app_owner;
  END IF;
END
$auth_user_pin_self_owner$;

REVOKE ALL ON FUNCTION app.auth_user_pin_read_self() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_upsert_self(text) FROM PUBLIC;

DO $auth_user_pin_self_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.user_pins FROM app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_user_pin_read_self() TO app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_user_pin_upsert_self(text) TO app_patient;
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_read(uuid) FROM app_patient;
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_upsert(uuid, text) FROM app_patient;
  END IF;
END
$auth_user_pin_self_runtime_grants$;

COMMENT ON FUNCTION app.auth_user_pin_read_self() IS
  'Identity-self PIN read: returns only the signed current principal own PIN row.';
COMMENT ON FUNCTION app.auth_user_pin_upsert_self(text) IS
  'Identity-self PIN action: creates or replaces only the signed current principal own PIN row.';
