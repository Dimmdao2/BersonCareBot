-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: position('p_status IS DISTINCT FROM ''failed''' in pg_get_functiondef('app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)'::regprocedure)) > 0
--
-- The queue is the canonical delivery state machine. This seam may record only a real failed
-- provider attempt; successes, local skips, and preparation failures already have their outcome on
-- public.outgoing_delivery_queue and must not become a second lifecycle journal.

CREATE OR REPLACE FUNCTION app.integrator_record_notification_delivery_attempt(
  p_organization_id uuid,
  p_user_id text,
  p_integrator_user_id text,
  p_topic_code text,
  p_intent_type text,
  p_channel text,
  p_status text,
  p_reason text,
  p_provider_status_code integer,
  p_event_id text,
  p_occurrence_id text,
  p_recipient_ref text,
  p_error_message text,
  p_metadata text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.notification-delivery-attempt.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($9))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($10))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($11))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($12))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($13))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($14))::app.port_typed_arg
    ]),
    'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)'::regprocedure
  );

  IF p_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'notification_delivery_attempt_must_be_failed_provider_attempt'
      USING ERRCODE = '22023';
  END IF;
  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;

  v_user_id := p_user_id::uuid;

  IF v_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = v_user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = v_user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    )
  THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_user_outside_organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_delivery_attempts (
    organization_id,
    user_id, integrator_user_id, topic_code, intent_type, channel, status, reason,
    provider_status_code, event_id, occurrence_id, recipient_ref, error_message, metadata
  ) VALUES (
    p_organization_id,
    v_user_id,
    p_integrator_user_id,
    p_topic_code,
    p_intent_type,
    p_channel,
    p_status,
    p_reason,
    p_provider_status_code,
    p_event_id,
    p_occurrence_id::uuid,
    p_recipient_ref,
    p_error_message,
    p_metadata::jsonb
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: position('clinic_smtp_outbound' in pg_get_functiondef('app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,text,timestamp with time zone)'::regprocedure)) > 0
--
-- Keep the existing delivery-target profile as the one eligibility resolver. It returns a boolean
-- only: a verified recipient can be materialized when either the platform SMTP or this clinic's
-- enabled SMTP profile can deliver, without exposing either credential to application code.

CREATE OR REPLACE FUNCTION app.read_patient_reminder_delivery_target_snapshot(
  p_organization_id uuid,
  p_platform_user_id uuid,
  p_topic_code text,
  p_now timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL RESTRICTED
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient_email text;
  v_patient_email_confirmed_at timestamptz;
  v_reminder_muted_until timestamptz;
  v_preferences jsonb;
  v_topic_preferences jsonb;
  v_bindings jsonb;
  v_has_web_push boolean;
  v_topic_master_enabled boolean;
  v_vapid_configured boolean;
  v_smtp_configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_materialization_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'reminder.materialization.targets.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg
    ]),
    'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,text,timestamp with time zone)'::regprocedure
  );
  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder target organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_topic_code IS NULL OR btrim(p_topic_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_topic_required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_target_outside_organization');
  END IF;
  SELECT email_contact.value_normalized, email_contact.confirmed_at, patient.reminder_muted_until
  INTO v_patient_email, v_patient_email_confirmed_at, v_reminder_muted_until
  FROM public.platform_users AS patient
  LEFT JOIN public.user_contacts AS email_contact
    ON email_contact.platform_user_id = patient.id
   AND email_contact.contact_kind = 'email'
   AND email_contact.is_primary = true
  WHERE patient.id = p_platform_user_id
    AND patient.merged_into_id IS NULL
    AND patient.is_blocked = false
    AND patient.is_archived = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_target_identity_mismatch');
  END IF;
  SELECT COALESCE(jsonb_object_agg(binding.channel_code, binding.external_id), '{}'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = p_platform_user_id
    AND binding.channel_code IN ('telegram', 'max', 'vk')
    AND binding.bot_blocked_at IS NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channelCode', preference.channel_code,
    'isEnabledForMessages', preference.is_enabled_for_messages,
    'isEnabledForNotifications', preference.is_enabled_for_notifications,
    'isPreferredForAuth', preference.is_preferred_for_auth
  ) ORDER BY preference.channel_code), '[]'::jsonb)
  INTO v_preferences
  FROM public.user_channel_preferences AS preference
  WHERE preference.platform_user_id = p_platform_user_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'topicCode', preference.topic_code,
    'channelCode', preference.channel_code,
    'isEnabled', preference.is_enabled
  ) ORDER BY preference.topic_code, preference.channel_code), '[]'::jsonb)
  INTO v_topic_preferences
  FROM public.user_notification_topic_channels AS preference
  WHERE preference.user_id = p_platform_user_id;
  SELECT COALESCE((
    SELECT topic.is_enabled FROM public.user_notification_topics AS topic
    WHERE topic.user_id = p_platform_user_id AND topic.topic_code = p_topic_code
  ), true) INTO v_topic_master_enabled;
  SELECT EXISTS (
    SELECT 1 FROM public.user_web_push_subscriptions AS subscription
    WHERE subscription.user_id = p_platform_user_id
  ) INTO v_has_web_push;
  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'web_push_vapid'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,publicKey}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,privateKey}', '')) <> ''
  ) INTO v_vapid_configured;
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings AS setting
    WHERE setting.scope = 'admin'
      AND (
        (setting.key = 'smtp_outbound' AND setting.organization_id IS NULL)
        OR (
          setting.key = 'clinic_smtp_outbound'
          AND setting.organization_id = v_org
          AND setting.value_json #>> '{deliveryReadiness,status}' = 'enabled'
        )
      )
      AND btrim(COALESCE(setting.value_json #>> '{value,host}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,user}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,from}', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      AND COALESCE(setting.value_json #>> '{value,port}', '') ~ '^[0-9]+$'
      AND (setting.value_json #>> '{value,port}')::integer BETWEEN 1 AND 65535
  ) INTO v_smtp_configured;
  RETURN jsonb_build_object(
    'ok', true,
    'bindings', v_bindings,
    'channelPreferences', v_preferences,
    'topicChannelRows', v_topic_preferences,
    'emailRecipient', NULLIF(btrim(v_patient_email), ''),
    'emailVerified', v_patient_email_confirmed_at IS NOT NULL,
    'muted', v_reminder_muted_until IS NOT NULL AND v_reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$;
