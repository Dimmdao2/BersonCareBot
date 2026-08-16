-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0446
-- Authentication failures occur before a user identity exists. They retain the request-scoped
-- pre-session capability and therefore write a platform audit row with a deliberately NULL actor.
CREATE OR REPLACE FUNCTION app.append_platform_audit_event(
  p_action text,
  p_details text,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  v_target_role name;
  v_actor_id uuid;
  inserted_id uuid;
  details_json jsonb;
BEGIN
  v_target_role := app.require_attested_target_role(
    'app_seam_telemetry_operator_owner'::name,
    ARRAY['app_platform_admin'::name, 'app_pre_session'::name]::name[]
  );

  IF v_target_role = 'app_platform_admin'::name THEN
    v_actor_id := app.current_actor_user_id();
  ELSIF v_target_role = 'app_pre_session'::name THEN
    v_actor_id := NULL;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;

  details_json := p_details::jsonb;
  IF p_action IS NULL
    OR p_action NOT IN (
      'operator_incidents_acknowledge_all',
      'operator_incidents_resolve_all',
      'health_failure_archive_clear_dead',
      'auth_register_failure'
    )
    OR p_details IS NULL
    OR pg_catalog.jsonb_typeof(details_json) <> 'object'
    OR pg_catalog.pg_column_size(details_json) > 65536
    OR p_status IS NULL
    OR p_status NOT IN ('ok', 'partial_failure', 'error')
  THEN
    RAISE EXCEPTION 'invalid platform audit event'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, details, status
  ) VALUES (
    NULL, v_actor_id, p_action, details_json, p_status
  )
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$function$;
REVOKE ALL ON FUNCTION app.append_platform_audit_event(text,text,text) FROM PUBLIC;
