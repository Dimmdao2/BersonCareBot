-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-VERIFY: SELECT app.read_integrator_provider_runtime_setting('vk_callback_secret');
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_integrator_clinic_delivery_credential(text,uuid)');
CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $_$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-provider.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_integrator_provider_runtime_setting(text)'::regprocedure);
  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN ('telegram_bot_token','telegram_webhook_secret','telegram_send_menu_on_button_press',
                  'max_bot_api_key','max_webhook_secret','max_api_base_url',
                  'vk_community_access_token','vk_callback_secret','vk_callback_confirmation_token',
                  'smsc_enabled','smsc_api_key','smsc_base_url')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END $_$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(p_key text, p_organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_value jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name]::name[]);
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'clinic credential organization context denied' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN (
    'clinic_smtp_outbound', 'clinic_smsc_api_key',
    'clinic_telegram_bot_token', 'clinic_max_bot_api_key', 'clinic_vk_community_access_token'
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
$$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT app.read_patient_reminder_delivery_target_snapshot('00000000-0000-4000-8000-000000000000'::uuid, '00000000-0000-4000-8000-000000000000'::uuid, 0, 'warmup_reminders', now());
CREATE OR REPLACE FUNCTION app.read_patient_reminder_delivery_target_snapshot(p_organization_id uuid, p_platform_user_id uuid, p_integrator_user_id bigint, p_topic_code text, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient public.platform_users%ROWTYPE;
  v_patient_email text;
  v_patient_email_confirmed_at timestamptz;
  v_preferences jsonb;
  v_topic_preferences jsonb;
  v_bindings jsonb;
  v_has_web_push boolean;
  v_topic_master_enabled boolean;
  v_vapid_configured boolean;
  v_smtp_configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_materialization_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'reminder.materialization.targets.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($5))::app.port_typed_arg]), 'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)'::regprocedure);

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

  SELECT patient.integrator_user_id, email_contact.value_normalized,
         email_contact.confirmed_at, patient.reminder_muted_until
  INTO v_patient.integrator_user_id, v_patient_email,
       v_patient_email_confirmed_at, v_patient.reminder_muted_until
  FROM public.platform_users AS patient
  LEFT JOIN public.user_contacts AS email_contact
    ON email_contact.platform_user_id = patient.id
   AND email_contact.contact_kind = 'email'
   AND email_contact.is_primary = true
  WHERE patient.id = p_platform_user_id
    AND patient.merged_into_id IS NULL
    AND patient.is_blocked = false
    AND patient.is_archived = false;
  IF NOT FOUND OR (p_integrator_user_id IS NOT NULL
      AND v_patient.integrator_user_id IS DISTINCT FROM p_integrator_user_id) THEN
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
    SELECT topic.is_enabled
    FROM public.user_notification_topics AS topic
    WHERE topic.user_id = p_platform_user_id
      AND topic.topic_code = p_topic_code
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
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'smtp_outbound'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
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
    'muted', v_patient.reminder_muted_until IS NOT NULL AND v_patient.reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$
;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_topic_channels_channel_check' AND pg_get_constraintdef(oid) LIKE '%vk%');
ALTER TABLE public.user_notification_topic_channels
  DROP CONSTRAINT user_notification_topic_channels_channel_check,
  ADD CONSTRAINT user_notification_topic_channels_channel_check
    CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'email'::text, 'web_push'::text]));
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.set_current_patient_notification_topic_channel(text,text,boolean)');
CREATE OR REPLACE FUNCTION app.set_current_patient_notification_topic_channel(p_topic_code text, p_channel_code text, p_is_enabled boolean) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $_$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_topic text := btrim(p_topic_code);
  v_channel text := btrim(p_channel_code);
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.notification-topic-channel.set', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.set_current_patient_notification_topic_channel(text,text,boolean)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_is_enabled IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(
         (SELECT s.value_json->'value'
          FROM public.app_runtime_settings s
          WHERE s.key = 'notifications_topics'
            AND s.scope = 'admin'
            AND s.audience = 'authenticated_client'
            AND (s.organization_id = v_org OR s.organization_id IS NULL)
          ORDER BY s.organization_id NULLS LAST
          LIMIT 1),
         '[]'::jsonb
       )) topic(value)
       WHERE btrim(topic.value->>'id') = v_topic
     )
     OR v_channel NOT IN ('telegram', 'max', 'vk', 'email', 'web_push')
     OR (v_topic IN ('warmup_reminders', 'training_reminders') AND v_channel = 'email') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_notification_topic_channels (
    user_id, topic_code, channel_code, is_enabled, updated_at
  ) VALUES (
    v_patient, v_topic, v_channel, p_is_enabled, statement_timestamp()
  )
  ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
  WHERE user_notification_topic_channels.user_id = v_patient;
  RETURN FOUND;
END
$_$
;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef('app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)'::regprocedure) LIKE '%''vk''%';
DO $bcb_vk_reminder_commit$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'patient reminder materialization function is missing';
  END IF;
  v_definition := replace(
    v_definition,
    'v_channel NOT IN (''telegram'', ''max'', ''email'', ''web_push'')',
    'v_channel NOT IN (''telegram'', ''max'', ''vk'', ''email'', ''web_push'')'
  );
  IF v_definition NOT LIKE '%''vk''%' THEN
    RAISE EXCEPTION 'patient reminder materialization VK channel replacement failed';
  END IF;
  EXECUTE v_definition;
END
$bcb_vk_reminder_commit$
;
