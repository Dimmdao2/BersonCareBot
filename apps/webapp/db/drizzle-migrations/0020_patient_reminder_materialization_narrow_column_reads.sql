-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0020
--
-- The three materialization roots each read a whole row (`alias.*` / `%ROWTYPE`) from a relation on
-- which their seam owner holds only the narrow per-column grants its declared surface asks for. A star
-- expands to every column of the relation at parse time, so the executor demands column privileges the
-- declaration deliberately withholds and PostgreSQL answers "permission denied for table ..." (42501).
-- The wake therefore returned 500 on every tick and no patient reminder was ever materialized.
--
-- Resolution is to stop reading columns the seams do not use, NOT to widen the grants: the withheld
-- columns are delivery outcome (sent_at, failed_at, delivery_channel, delivery_job_id, error_code) and
-- patient identity/medical fields (role, birth_date, gender, height_cm, weight_kg, session_epoch, ...),
-- none of which any of the three roots reads. Each read now names exactly the columns it consumes,
-- which are already inside the declared surface in deploy/postgres/privileges/function-census.ts.

CREATE OR REPLACE FUNCTION app.read_patient_reminder_materialization_snapshot(
  p_organization_id uuid,
  p_now timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_rules jsonb;
  v_due jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_materialization_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'reminder.materialization.snapshot.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_now))::app.port_typed_arg
    ]),
    'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)'::regprocedure
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder materialization organization mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rule.integrator_rule_id,
    'organizationId', rule.organization_id,
    'platformUserId', rule.platform_user_id,
    'integratorUserId', CASE WHEN rule.integrator_user_id IS NULL THEN NULL ELSE rule.integrator_user_id::text END,
    'category', rule.category,
    'isEnabled', rule.is_enabled,
    'scheduleType', rule.schedule_type,
    'timezone', rule.timezone,
    'intervalMinutes', rule.interval_minutes,
    'windowStartMinute', rule.window_start_minute,
    'windowEndMinute', rule.window_end_minute,
    'daysMask', rule.days_mask,
    'scheduleData', rule.schedule_data,
    'quietHoursStartMinute', rule.quiet_hours_start_minute,
    'quietHoursEndMinute', rule.quiet_hours_end_minute,
    'linkedObjectType', rule.linked_object_type,
    'linkedObjectId', rule.linked_object_id,
    'customTitle', rule.custom_title,
    'customText', rule.custom_text,
    'displayTitle', rule.display_title,
    'reminderIntent', rule.reminder_intent,
    'notificationTopicCode', rule.notification_topic_code,
    'linkedTitle', CASE
      WHEN rule.linked_object_type = 'content_page' THEN (
        SELECT page.title
        FROM public.content_pages AS page
        WHERE page.slug = rule.linked_object_id
          AND page.is_published = true
          AND page.deleted_at IS NULL
          AND (page.organization_id = v_org OR page.organization_id IS NULL)
        ORDER BY (page.organization_id = v_org) DESC, page.updated_at DESC, page.id
        LIMIT 1
      )
      WHEN rule.linked_object_type = 'content_section' THEN (
        SELECT section.title
        FROM public.content_sections AS section
        WHERE section.slug = rule.linked_object_id
          AND section.is_visible = true
          AND (section.organization_id = v_org OR section.organization_id IS NULL)
        ORDER BY (section.organization_id = v_org) DESC, section.updated_at DESC, section.id
        LIMIT 1
      )
      ELSE NULL
    END
  ) ORDER BY rule.integrator_rule_id), '[]'::jsonb)
  INTO v_rules
  FROM public.reminder_rules AS rule
  WHERE rule.organization_id = v_org
    AND rule.is_enabled = true
    AND rule.platform_user_id IS NOT NULL
    AND rule.integrator_user_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ruleId', occurrence.rule_id,
    'occurrenceId', occurrence.id,
    'deliveryGeneration', occurrence.delivery_generation,
    'occurrenceKey', occurrence.occurrence_key,
    'plannedAt', occurrence.planned_at
  ) ORDER BY occurrence.planned_at, occurrence.id), '[]'::jsonb)
  INTO v_due
  FROM (
    SELECT candidate.id, candidate.rule_id, candidate.occurrence_key,
           candidate.planned_at, candidate.delivery_generation
    FROM integrator.user_reminder_occurrences AS candidate
    INNER JOIN public.reminder_rules AS rule
      ON rule.integrator_rule_id = candidate.rule_id
     AND rule.organization_id = candidate.organization_id
     AND rule.platform_user_id = candidate.platform_user_id
    WHERE candidate.organization_id = v_org
      AND candidate.status = 'planned'
      AND candidate.planned_at <= p_now
      AND rule.is_enabled = true
    ORDER BY candidate.planned_at, candidate.id
    LIMIT 100
  ) AS occurrence;

  RETURN jsonb_build_object('ok', true, 'rules', v_rules, 'dueOccurrences', v_due);
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.read_patient_reminder_delivery_target_snapshot(
  p_organization_id uuid,
  p_platform_user_id uuid,
  p_integrator_user_id bigint,
  p_topic_code text,
  p_now timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient public.platform_users%ROWTYPE;
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
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_platform_user_id))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send(p_integrator_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_topic_code))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_now))::app.port_typed_arg
    ]),
    'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)'::regprocedure
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

  SELECT patient.integrator_user_id, patient.email, patient.email_verified_at, patient.reminder_muted_until
  INTO v_patient.integrator_user_id, v_patient.email, v_patient.email_verified_at, v_patient.reminder_muted_until
  FROM public.platform_users AS patient
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
    AND binding.channel_code IN ('telegram', 'max')
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
    'emailRecipient', NULLIF(btrim(v_patient.email), ''),
    'emailVerified', v_patient.email_verified_at IS NOT NULL,
    'muted', v_patient.reminder_muted_until IS NOT NULL AND v_patient.reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization(
  p_organization_id uuid,
  p_occurrence_id text,
  p_rule_id text,
  p_platform_user_id uuid,
  p_occurrence_key text,
  p_planned_at timestamp with time zone,
  p_delivery_generation integer,
  p_deliveries_json text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_deliveries jsonb;
  v_delivery jsonb;
  v_existing integrator.user_reminder_occurrences%ROWTYPE;
  v_topic_code text;
  v_integrator_user_id text;
  v_event_id text;
  v_channel text;
  v_external_id text;
  v_log_text text;
  v_intent jsonb;
  v_intent_payload jsonb;
  v_queue_payload jsonb;
  v_event_ids text[] := ARRAY[]::text[];
  v_affected integer := 0;
  v_row_count integer;
  v_fingerprint text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_materialization_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'reminder.materialization.commit',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_occurrence_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_rule_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_platform_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_occurrence_key))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_planned_at))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_delivery_generation))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_deliveries_json))::app.port_typed_arg
    ]),
    'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)'::regprocedure
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder commit organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_occurrence_id IS NULL OR btrim(p_occurrence_id) = ''
     OR p_rule_id IS NULL OR btrim(p_rule_id) = ''
     OR p_occurrence_key IS NULL OR btrim(p_occurrence_key) = ''
     OR p_delivery_generation IS NULL OR p_delivery_generation < 0 THEN
    RAISE EXCEPTION 'invalid patient reminder occurrence envelope' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_deliveries := p_deliveries_json::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid patient reminder deliveries json' USING ERRCODE = '22023';
  END;
  IF jsonb_typeof(v_deliveries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid patient reminder deliveries envelope' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_deliveries) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'no_channels');
  END IF;
  IF jsonb_array_length(v_deliveries) > 4 THEN
    RAISE EXCEPTION 'too many patient reminder deliveries' USING ERRCODE = '22023';
  END IF;

  SELECT rule.notification_topic_code, rule.integrator_user_id::text
  INTO v_topic_code, v_integrator_user_id
  FROM public.reminder_rules AS rule
  WHERE rule.integrator_rule_id = p_rule_id
    AND rule.organization_id = v_org
    AND rule.platform_user_id = p_platform_user_id
    AND rule.is_enabled = true
    AND rule.integrator_user_id IS NOT NULL
    AND rule.notification_topic_code IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = p_platform_user_id
        AND enrollment.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = p_platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    );
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;

  INSERT INTO integrator.user_reminder_occurrences (
    id, rule_id, platform_user_id, occurrence_key, planned_at, status,
    delivery_generation, organization_id, created_at, updated_at
  ) VALUES (
    p_occurrence_id, p_rule_id, p_platform_user_id, p_occurrence_key, p_planned_at, 'planned',
    p_delivery_generation, v_org, statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (occurrence_key) DO NOTHING;

  SELECT candidate.id, candidate.rule_id, candidate.organization_id, candidate.platform_user_id,
         candidate.planned_at, candidate.status, candidate.delivery_generation
  INTO v_existing.id, v_existing.rule_id, v_existing.organization_id, v_existing.platform_user_id,
       v_existing.planned_at, v_existing.status, v_existing.delivery_generation
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.occurrence_key = p_occurrence_key
  FOR UPDATE;
  IF NOT FOUND
     OR v_existing.rule_id IS DISTINCT FROM p_rule_id
     OR v_existing.organization_id IS DISTINCT FROM v_org
     OR v_existing.platform_user_id IS DISTINCT FROM p_platform_user_id
     OR v_existing.planned_at IS DISTINCT FROM p_planned_at
     OR v_existing.status NOT IN ('planned', 'queued') THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;
  IF v_existing.status = 'queued' THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'dedup');
  END IF;
  IF v_existing.id IS DISTINCT FROM p_occurrence_id
     OR v_existing.delivery_generation IS DISTINCT FROM p_delivery_generation THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;

  FOR v_delivery IN SELECT value FROM jsonb_array_elements(v_deliveries) AS item(value) LOOP
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object'
       OR pg_catalog.octet_length(v_delivery::text) > 65536
       OR jsonb_typeof(v_delivery -> 'organizationId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'eventId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'kind') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'channel') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'occurrenceId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'deliveryGeneration') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_delivery -> 'topicCode') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'externalId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'logText') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'platformUserId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'maxAttempts') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_delivery -> 'nextRetryAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'intent') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid patient reminder delivery scalar types' USING ERRCODE = '22023';
    END IF;

    v_event_id := v_delivery ->> 'eventId';
    v_channel := v_delivery ->> 'channel';
    v_external_id := v_delivery ->> 'externalId';
    v_log_text := v_delivery ->> 'logText';
    v_intent := v_delivery -> 'intent';
    v_intent_payload := v_intent -> 'payload';

    IF v_delivery ->> 'organizationId' IS DISTINCT FROM v_org::text
       OR v_delivery ->> 'occurrenceId' IS DISTINCT FROM v_existing.id
       OR (v_delivery ->> 'deliveryGeneration') !~ '^[0-9]+$'
       OR (v_delivery ->> 'deliveryGeneration')::integer <> v_existing.delivery_generation
       OR v_delivery ->> 'platformUserId' IS DISTINCT FROM p_platform_user_id::text
       OR v_delivery ->> 'topicCode' IS DISTINCT FROM v_topic_code
       OR pg_catalog.length(v_delivery ->> 'topicCode') NOT BETWEEN 1 AND 128
       OR v_delivery ->> 'kind' IS DISTINCT FROM 'reminder_dispatch'
       OR v_channel NOT IN ('telegram', 'max', 'email', 'web_push')
       OR pg_catalog.length(v_event_id) NOT BETWEEN 1 AND 512
       OR v_event_id IS DISTINCT FROM concat(
         'rem:', v_existing.id, ':g', v_existing.delivery_generation::text, ':', v_channel
       )
       OR pg_catalog.btrim(v_external_id) IS DISTINCT FROM v_external_id
       OR pg_catalog.length(v_external_id) NOT BETWEEN 1 AND 512
       OR pg_catalog.length(v_log_text) NOT BETWEEN 1 AND 16000
       OR (v_delivery ->> 'maxAttempts') !~ '^[0-9]+$'
       OR (v_delivery ->> 'maxAttempts')::integer NOT BETWEEN 1 AND 20
       OR (v_delivery ->> 'nextRetryAt')::timestamptz IS DISTINCT FROM p_planned_at THEN
      RAISE EXCEPTION 'invalid patient reminder ready delivery' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_intent -> 'meta') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent #> '{meta,eventId}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,occurredAt}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,source}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,userId}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,outboundMessageClass}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,outboundCapability}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent_payload -> 'recipient') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload -> 'message') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload #> '{message,text}') IS DISTINCT FROM 'string'
       OR v_intent ->> 'type' IS DISTINCT FROM 'message.send'
       OR v_intent #>> '{meta,eventId}' IS DISTINCT FROM v_event_id
       OR pg_catalog.length(v_intent #>> '{meta,occurredAt}') NOT BETWEEN 20 AND 40
       OR (v_intent #>> '{meta,occurredAt}')::timestamptz IS NULL
       OR v_intent #>> '{meta,source}' IS DISTINCT FROM v_channel
       OR v_intent #>> '{meta,userId}' IS DISTINCT FROM v_integrator_user_id
       OR v_intent #>> '{meta,outboundMessageClass}' IS DISTINCT FROM 'routine_product'
       OR v_intent #>> '{meta,outboundCapability}' IS DISTINCT FROM
          (CASE WHEN v_channel = 'web_push' THEN 'app_push' ELSE 'essential_delivery' END)
       OR pg_catalog.length(v_intent_payload #>> '{message,text}') NOT BETWEEN 1 AND 65536
       OR jsonb_typeof(v_intent_payload -> 'delivery') IS DISTINCT FROM 'object'
       OR v_intent_payload #> '{delivery,channels}' IS DISTINCT FROM jsonb_build_array(v_channel)
       OR jsonb_typeof(v_intent_payload #> '{delivery,maxAttempts}') IS DISTINCT FROM 'number'
       OR v_intent_payload #>> '{delivery,maxAttempts}' IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'invalid patient reminder intent envelope' USING ERRCODE = '22023';
    END IF;

    IF (v_channel = 'telegram' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,chatId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,chatId}' IS DISTINCT FROM v_external_id
        ))
       OR (v_channel = 'max' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,userId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,userId}' IS DISTINCT FROM v_external_id
        ))
       OR (v_channel = 'email' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,email}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,email}' IS DISTINCT FROM v_external_id
          OR v_intent_payload #>> '{message,text}' IS DISTINCT FROM v_log_text
          OR jsonb_typeof(v_intent_payload -> 'subject') IS DISTINCT FROM 'string'
          OR pg_catalog.length(v_intent_payload ->> 'subject') NOT BETWEEN 1 AND 200
        ))
       OR (v_channel = 'web_push' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,pushUserId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,pushUserId}' IS DISTINCT FROM v_external_id
          OR v_external_id IS DISTINCT FROM p_platform_user_id::text
          OR v_intent_payload #>> '{message,text}' IS DISTINCT FROM v_log_text
          OR jsonb_typeof(v_intent_payload -> 'title') IS DISTINCT FROM 'string'
          OR pg_catalog.length(v_intent_payload ->> 'title') NOT BETWEEN 1 AND 200
        )) THEN
      RAISE EXCEPTION 'invalid patient reminder channel recipient' USING ERRCODE = '22023';
    END IF;

    IF v_event_id = ANY(v_event_ids) THEN
      RAISE EXCEPTION 'duplicate patient reminder delivery event' USING ERRCODE = '22023';
    END IF;
    v_event_ids := array_append(v_event_ids, v_event_id);

    v_queue_payload := jsonb_build_object(
      'occurrenceId', v_existing.id,
      'deliveryGeneration', v_existing.delivery_generation,
      'topicCode', v_topic_code,
      'channel', v_channel,
      'deliveryLogId', concat('rdl:', v_existing.id, ':g', v_existing.delivery_generation::text, ':', v_channel),
      'externalId', v_external_id,
      'logText', v_log_text,
      'platformUserId', p_platform_user_id,
      'intent', v_intent
    );

    INSERT INTO public.outgoing_delivery_queue (
      organization_id, event_id, kind, channel, payload_json, status, attempt_count,
      max_attempts, next_retry_at, last_error, dead_at, priority, created_at, updated_at
    ) VALUES (
      v_org,
      v_event_id,
      'reminder_dispatch',
      v_channel,
      v_queue_payload,
      'pending', 0, (v_delivery ->> 'maxAttempts')::integer,
      (v_delivery ->> 'nextRetryAt')::timestamptz, NULL, NULL, 0,
      statement_timestamp(), statement_timestamp()
    )
    ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      PERFORM 1
      FROM public.outgoing_delivery_queue AS queued
      WHERE queued.event_id = v_event_id
        AND queued.organization_id = v_org
        AND queued.kind = 'reminder_dispatch'
        AND queued.channel = v_channel
        AND queued.status IN ('pending', 'failed_retryable')
        AND queued.max_attempts = (v_delivery ->> 'maxAttempts')::integer
        AND (queued.payload_json - 'materializationFingerprint') = v_queue_payload
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'patient reminder queue conflict' USING ERRCODE = '23505';
      END IF;

      UPDATE public.outgoing_delivery_queue AS queued
      SET status = 'pending',
          attempt_count = 0,
          next_retry_at = (v_delivery ->> 'nextRetryAt')::timestamptz,
          last_error = NULL,
          dead_at = NULL,
          updated_at = statement_timestamp()
      WHERE queued.event_id = v_event_id
        AND queued.organization_id = v_org
        AND queued.kind = 'reminder_dispatch'
        AND queued.channel = v_channel
        AND queued.status IN ('pending', 'failed_retryable')
        AND (queued.payload_json - 'materializationFingerprint') = v_queue_payload;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count <> 1 THEN
        RAISE EXCEPTION 'patient reminder queue conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
    v_affected := v_affected + v_row_count;
  END LOOP;

  FOR v_delivery IN SELECT value FROM jsonb_array_elements(v_deliveries) AS item(value) LOOP
    v_fingerprint := app.patient_reminder_materialization_fingerprint(
      v_existing.id,
      v_delivery ->> 'channel'
    );
    IF v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{32}$' THEN
      RAISE EXCEPTION 'patient reminder materialization fingerprint unavailable';
    END IF;
    UPDATE public.outgoing_delivery_queue AS queued
    SET payload_json = jsonb_set(queued.payload_json, '{materializationFingerprint}', to_jsonb(v_fingerprint), true),
        updated_at = statement_timestamp()
    WHERE queued.event_id = v_delivery ->> 'eventId'
      AND queued.organization_id = v_org
      AND queued.kind = 'reminder_dispatch'
      AND queued.channel = v_delivery ->> 'channel'
      AND queued.payload_json ->> 'occurrenceId' = v_existing.id
      AND queued.payload_json ->> 'deliveryGeneration' = v_existing.delivery_generation::text
      AND queued.status IN ('pending', 'failed_retryable');
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'patient reminder fingerprint queue conflict' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  UPDATE integrator.user_reminder_occurrences AS occurrence
  SET status = 'queued', queued_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE occurrence.id = v_existing.id
    AND occurrence.delivery_generation = v_existing.delivery_generation
    AND occurrence.status = 'planned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient reminder occurrence queue mark failed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', CASE WHEN v_affected > 0 THEN 'materialized' ELSE 'dedup' END
  );
END
$function$;
