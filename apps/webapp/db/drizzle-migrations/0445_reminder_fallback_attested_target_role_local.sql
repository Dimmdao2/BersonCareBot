-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0445
-- 0444 is already recorded in the live DEV Drizzle ledger. Converge it forward instead of
-- mutating applied history; a clean TEST deploy applies 0444 then this replacement in order.
-- Return the exact role of the current, still-active accepted port context without exposing
-- app_ext.accepted_port_contexts to downstream seam owners.
CREATE OR REPLACE FUNCTION app.require_attested_target_role(
  p_effective_role name,
  p_allowed_target_roles name[]
)
RETURNS name
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  v_database_id oid;
  v_target_role name;
BEGIN
  IF p_allowed_target_roles IS NULL
    OR cardinality(p_allowed_target_roles) = 0
    OR array_position(p_allowed_target_roles, NULL::name) IS NOT NULL
    OR NOT (
      (
        p_effective_role = 'app_seam_reminder_patient_owner'::name
        AND p_allowed_target_roles <@ ARRAY['app_patient'::name, 'app_staff'::name]::name[]
      )
      OR (
        p_effective_role = 'app_seam_telemetry_operator_owner'::name
        AND p_allowed_target_roles <@ ARRAY['app_platform_admin'::name, 'app_pre_session'::name]::name[]
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;

  SELECT oid INTO v_database_id
    FROM pg_database
   WHERE datname = current_database();

  SELECT accepted.target_role
    INTO v_target_role
    FROM app_ext.accepted_port_contexts AS accepted
    JOIN app_ext.port_context_capabilities AS capability
      ON capability.capability_id = accepted.capability_id
     AND capability.port = accepted.port
     AND capability.session_login = accepted.session_login
     AND capability.target_role = accepted.target_role
     AND capability.context_class = accepted.context_class
     AND capability.purpose = accepted.purpose
     AND capability.function_identity IS NOT DISTINCT FROM accepted.function_identity
     AND capability.active_from <= clock_timestamp()
     AND (capability.active_until IS NULL OR capability.active_until > clock_timestamp())
   WHERE accepted.database_oid = v_database_id
     AND accepted.backend_pid = pg_backend_pid()
     AND accepted.transaction_id = pg_current_xact_id()
     AND accepted.cleared_at IS NULL
     AND accepted.session_login = session_user
     AND accepted.target_role = ANY(p_allowed_target_roles);

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  RETURN v_target_role;
END
$function$;
REVOKE ALL ON FUNCTION app.require_attested_target_role(name,name[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_attested_target_role(name,name[])
TO app_seam_reminder_patient_owner, app_seam_telemetry_operator_owner;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.enqueue_current_reminder_rule_push(p_integrator_rule_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid;
  v_target_role name;
  v_payload jsonb;
BEGIN
  v_target_role := app.require_attested_target_role(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );

  IF length(btrim(COALESCE(p_integrator_rule_id, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid reminder rule id' USING ERRCODE = '23514';
  END IF;

  IF v_target_role = 'app_patient'::name THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF v_target_role = 'app_staff'::name THEN
    PERFORM app.current_actor_user_id();
  ELSE
    RAISE EXCEPTION 'reminder fallback context denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', rule.integrator_rule_id,
    'integratorUserId', rule.integrator_user_id::text,
    'category', rule.category,
    'enabled', rule.is_enabled,
    'intervalMinutes', rule.interval_minutes,
    'windowStartMinute', rule.window_start_minute,
    'windowEndMinute', rule.window_end_minute,
    'daysMask', rule.days_mask,
    'timezone', rule.timezone,
    'fallbackEnabled', rule.category IN ('appointment', 'lfk', 'chat', 'important'),
    'linkedObjectType', rule.linked_object_type,
    'linkedObjectId', rule.linked_object_id,
    'customTitle', rule.custom_title,
    'customText', rule.custom_text,
    'scheduleType', rule.schedule_type,
    'scheduleData', rule.schedule_data,
    'reminderIntent', COALESCE(rule.reminder_intent, 'generic'),
    'displayTitle', rule.display_title,
    'displayDescription', rule.display_description,
    'quietHoursStartMinute', rule.quiet_hours_start_minute,
    'quietHoursEndMinute', rule.quiet_hours_end_minute,
    'notificationTopicCode', rule.notification_topic_code,
    'updatedAt', rule.updated_at
  )
    INTO v_payload
    FROM public.reminder_rules AS rule
   WHERE rule.integrator_rule_id = p_integrator_rule_id
     AND rule.organization_id = v_organization_id
     AND (v_target_role = 'app_staff'::name OR rule.platform_user_id = v_patient_user_id);

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'reminder rule unavailable in current context' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.integrator_push_outbox (
    kind, idempotency_key, payload, status, attempts_done, next_try_at, last_error, updated_at
  ) VALUES (
    'reminder_rule_upsert', 'reminder_rule:' || p_integrator_rule_id, v_payload,
    'pending', 0, now(), NULL, now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        status = 'pending',
        attempts_done = 0,
        next_try_at = now(),
        last_error = NULL,
        updated_at = now();

  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION app.enqueue_current_reminder_rule_push(text) FROM PUBLIC;
