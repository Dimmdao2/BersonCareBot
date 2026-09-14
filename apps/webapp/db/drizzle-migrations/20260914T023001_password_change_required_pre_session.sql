-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.password_credentials_must_change(uuid)') IS NOT NULL AND to_regprocedure('app.password_credentials_must_change_self()') IS NULL
CREATE OR REPLACE FUNCTION app.password_credentials_must_change(p_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_must_change_at timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.password-change-required.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg
    ]),
    'app.password_credentials_must_change(uuid)'::regprocedure
  );

  SELECT credentials.must_change_at
  INTO v_must_change_at
  FROM public.user_password_credentials AS credentials
  WHERE credentials.user_id = p_user_id;

  RETURN v_must_change_at;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
DROP FUNCTION app.password_credentials_must_change_self();
