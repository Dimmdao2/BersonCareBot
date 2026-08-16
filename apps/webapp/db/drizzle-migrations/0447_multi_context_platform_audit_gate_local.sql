-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- TEMPORARY LOCAL MIGRATION NUMBER 0447
-- 0445/0446 were already recorded by DEV before privilege reconciliation rejected the indirect
-- multi-capability gate. Converge forward: the reminder-only accessor is no longer callable by the
-- telemetry seam, and the dual platform/pre-session root validates its exact capability directly.
REVOKE EXECUTE ON FUNCTION app.require_attested_target_role(name,name[])
FROM app_seam_telemetry_operator_owner;
GRANT EXECUTE ON FUNCTION app.require_attested_target_role(name,name[])
TO app_seam_reminder_patient_owner;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
        THEN 'app_platform_admin'::name
      ELSE 'app_pre_session'::name
    END,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
        THEN 'platform'::app.port_context_class
      ELSE 'pre_session'::app.port_context_class
    END,
    'platform.audit-event.append',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_action))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_details))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_status))::app.port_typed_arg
    ]),
    'app.append_platform_audit_event(text,text,text)'::regprocedure
  );

  v_target_role := CASE
    WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
      THEN 'app_platform_admin'::name
    ELSE 'app_pre_session'::name
  END;

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
