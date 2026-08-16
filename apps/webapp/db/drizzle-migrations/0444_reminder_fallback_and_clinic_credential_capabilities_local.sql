-- TEMPORARY LOCAL MIGRATION NUMBER 0444
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A failed immediate reminder relay may enqueue only the caller's current rule.  The durable
-- queue remains closed to patient/staff roles; this seam owns the fixed kind and idempotency key.
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
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );

  IF length(btrim(COALESCE(p_integrator_rule_id, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid reminder rule id' USING ERRCODE = '23514';
  END IF;

  SELECT accepted.target_role
    INTO v_target_role
    FROM app_ext.accepted_port_contexts AS accepted
   WHERE accepted.database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND accepted.backend_pid = pg_backend_pid()
     AND accepted.transaction_id = pg_current_xact_id()
     AND accepted.cleared_at IS NULL
     AND accepted.session_login = session_user
     AND accepted.target_role = ANY (ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF v_target_role = 'app_patient'::name THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF v_target_role = 'app_staff'::name THEN
    -- Staff never borrows a patient identity: the organization context and an attested actor
    -- are both required, while the rule remains constrained to that same organization.
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
     AND (v_target_role = 'app_staff'::name OR rule.platform_user_id = v_patient_user_id)
   FOR KEY SHARE;

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
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A tenant-service request may read only its attested organization credential.  The supplied UUID
-- is checked rather than trusted, so a caller cannot turn this exact credential seam into a
-- cross-organization reader.
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_value jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_integrator_owner'::name,
    ARRAY['app_tenant_service'::name]::name[]
  );
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'clinic credential organization context denied' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN (
    'clinic_smtp_outbound', 'clinic_smsc_api_key',
    'clinic_telegram_bot_token', 'clinic_max_bot_api_key'
  ) THEN
    RAISE EXCEPTION 'clinic credential key denied' USING ERRCODE = '42501';
  END IF;
  SELECT setting.value_json
    INTO v_value
    FROM public.system_settings AS setting
   WHERE setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id = v_organization_id
   LIMIT 1;
  RETURN v_value;
END
$function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.enqueue_current_reminder_rule_push(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid) FROM PUBLIC;
