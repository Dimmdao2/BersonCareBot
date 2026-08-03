-- TEMPORARY LOCAL MIGRATION NUMBER 9996 — D30 Ш4; final number assigned only after audit/sync.
-- Webapp owns reminder decisions. These capabilities expose only atomic materialization and a
-- boolean last-moment transport permission; no caller receives broad integrator-table writes.

GRANT USAGE ON SCHEMA integrator TO app_owner;
REVOKE SELECT, INSERT, UPDATE ON TABLE integrator.user_reminder_occurrences FROM app_owner;
GRANT SELECT ON TABLE public.reminder_rules, public.platform_users,
  public.user_channel_bindings, public.user_channel_preferences,
  public.user_notification_topics, public.user_notification_topic_channels,
  public.user_web_push_subscriptions, public.system_settings, public.reminder_journal TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.outgoing_delivery_queue TO app_owner;

CREATE OR REPLACE FUNCTION app.patient_reminder_materialization_fingerprint(
  p_occurrence_id text,
  p_channel text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT md5(jsonb_build_object(
    'occurrence', jsonb_build_array(
      occurrence.rule_id, occurrence.organization_id, occurrence.platform_user_id,
      occurrence.delivery_generation, occurrence.planned_at
    ),
    'rule', jsonb_build_array(
      rule.integrator_rule_id, rule.organization_id, rule.platform_user_id, rule.integrator_user_id,
      rule.is_enabled, rule.notification_topic_code, rule.reminder_intent, rule.linked_object_type,
      rule.linked_object_id, rule.custom_title, rule.custom_text, rule.display_title, rule.updated_at
    ),
    'patient', jsonb_build_array(
      patient.reminder_muted_until, patient.email, patient.email_verified_at, patient.updated_at
    ),
    'bindings', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        binding.channel_code, binding.external_id, binding.bot_blocked_at, binding.created_at
      ) ORDER BY binding.channel_code, binding.external_id)
      FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id
        AND binding.channel_code = p_channel
    ), '[]'::jsonb),
    'channelPreference', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        preference.channel_code, preference.is_enabled_for_notifications, preference.updated_at
      ) ORDER BY preference.channel_code)
      FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = occurrence.platform_user_id
        AND preference.channel_code = p_channel
    ), '[]'::jsonb),
    'topic', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(topic.topic_code, topic.is_enabled, topic.updated_at))
      FROM public.user_notification_topics AS topic
      WHERE topic.user_id = occurrence.platform_user_id
        AND topic.topic_code = delivery.payload_json ->> 'topicCode'
    ), '[]'::jsonb),
    'topicChannel', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        preference.topic_code, preference.channel_code, preference.is_enabled, preference.updated_at
      ))
      FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = occurrence.platform_user_id
        AND preference.topic_code = delivery.payload_json ->> 'topicCode'
        AND preference.channel_code = p_channel
    ), '[]'::jsonb),
    'webPushSubscriptions', CASE WHEN p_channel = 'web_push' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        subscription.endpoint, subscription.p256dh, subscription.auth, subscription.updated_at
      ) ORDER BY subscription.endpoint)
      FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = occurrence.platform_user_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'providerSettings', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        setting.key, setting.scope, setting.organization_id, setting.value_json, setting.updated_at
      ) ORDER BY setting.key, setting.scope, setting.organization_id NULLS FIRST)
      FROM public.system_settings AS setting
      WHERE (p_channel = 'web_push' AND setting.key = 'web_push_vapid' AND setting.scope = 'admin')
         OR (p_channel = 'email' AND setting.key = 'smtp_outbound' AND setting.scope = 'admin')
    ), '[]'::jsonb)
  )::text)
  FROM integrator.user_reminder_occurrences AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.rule_id
   AND rule.organization_id = occurrence.organization_id
   AND rule.platform_user_id = occurrence.platform_user_id
  INNER JOIN public.platform_users AS patient ON patient.id = occurrence.platform_user_id
  INNER JOIN public.outgoing_delivery_queue AS delivery
    ON delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', p_channel
    )
   AND delivery.kind = 'reminder_dispatch'
   AND delivery.organization_id = occurrence.organization_id
  WHERE occurrence.id = p_occurrence_id
$function$;

REVOKE ALL ON FUNCTION app.patient_reminder_materialization_fingerprint(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.upsert_patient_reminder_occurrence_plan(
  p_occurrence_id text,
  p_rule_id text,
  p_organization_id uuid,
  p_platform_user_id uuid,
  p_occurrence_key text,
  p_planned_at timestamptz
)
RETURNS TABLE(occurrence_id text, delivery_generation integer, materializable boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  caller_organization_id uuid;
  existing integrator.user_reminder_occurrences%ROWTYPE;
BEGIN
  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL OR caller_organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'patient reminder materialization tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.reminder_rules AS rule
    WHERE rule.integrator_rule_id = p_rule_id
      AND rule.organization_id = p_organization_id
      AND rule.platform_user_id = p_platform_user_id
      AND rule.is_enabled = true
      AND rule.notification_topic_code IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.platform_users AS patient
        WHERE patient.id = p_platform_user_id
          AND patient.is_blocked = false
          AND patient.is_archived = false
          AND patient.merged_into_id IS NULL
          AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
      )
  ) THEN
    RETURN QUERY SELECT p_occurrence_id, 0, false;
    RETURN;
  END IF;

  INSERT INTO integrator.user_reminder_occurrences (
    id, rule_id, platform_user_id, occurrence_key, planned_at, status,
    delivery_generation, organization_id, created_at, updated_at
  ) VALUES (
    p_occurrence_id, p_rule_id, p_platform_user_id, p_occurrence_key, p_planned_at, 'planned',
    0, p_organization_id, statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (occurrence_key) DO NOTHING;

  SELECT * INTO existing
  FROM integrator.user_reminder_occurrences AS occurrence
  WHERE occurrence.occurrence_key = p_occurrence_key
  FOR UPDATE;
  IF existing.rule_id IS DISTINCT FROM p_rule_id
    OR existing.organization_id IS DISTINCT FROM p_organization_id
    OR existing.platform_user_id IS DISTINCT FROM p_platform_user_id
    OR existing.planned_at IS DISTINCT FROM p_planned_at
    OR existing.status NOT IN ('planned', 'queued')
  THEN
    RETURN QUERY SELECT existing.id, existing.delivery_generation, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT existing.id, existing.delivery_generation, true;
END
$function$;

REVOKE ALL ON FUNCTION app.upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamptz)
  TO app_staff;

CREATE OR REPLACE FUNCTION app.mark_patient_reminder_occurrence_queued(
  p_occurrence_id text,
  p_generation integer,
  p_event_ids text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  occurrence integrator.user_reminder_occurrences%ROWTYPE;
  caller_organization_id uuid;
  invalid_count integer;
BEGIN
  IF COALESCE(array_length(p_event_ids, 1), 0) = 0 THEN RETURN false; END IF;
  SELECT * INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = p_occurrence_id
  FOR UPDATE;
  IF NOT FOUND OR occurrence.delivery_generation <> p_generation
    OR occurrence.status NOT IN ('planned', 'queued')
  THEN RETURN false; END IF;
  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL
    OR occurrence.organization_id IS DISTINCT FROM caller_organization_id
  THEN RAISE EXCEPTION 'patient reminder queued mark tenant mismatch' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO invalid_count
  FROM unnest(p_event_ids) AS requested(event_id)
  LEFT JOIN public.outgoing_delivery_queue AS delivery ON delivery.event_id = requested.event_id
  WHERE delivery.id IS NULL
     OR delivery.kind <> 'reminder_dispatch'
     OR delivery.organization_id IS DISTINCT FROM occurrence.organization_id
     OR delivery.status NOT IN ('pending', 'failed_retryable')
     OR delivery.payload_json ->> 'occurrenceId' IS DISTINCT FROM occurrence.id
     OR (delivery.payload_json ->> 'deliveryGeneration')::integer <> occurrence.delivery_generation
     OR delivery.payload_json ->> 'channel' IS DISTINCT FROM delivery.channel
     OR delivery.payload_json ->> 'topicCode' IS DISTINCT FROM (
       SELECT rule.notification_topic_code
       FROM public.reminder_rules AS rule
       WHERE rule.integrator_rule_id = occurrence.rule_id
         AND rule.organization_id = occurrence.organization_id
         AND rule.platform_user_id = occurrence.platform_user_id
     )
     OR delivery.event_id IS DISTINCT FROM concat(
       'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
     );
  IF invalid_count <> 0 THEN RETURN false; END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET payload_json = jsonb_set(
        delivery.payload_json,
        '{materializationFingerprint}',
        to_jsonb(app.patient_reminder_materialization_fingerprint(occurrence.id, delivery.channel)),
        true
      ),
      updated_at = statement_timestamp()
  WHERE delivery.event_id = ANY(p_event_ids);
  IF EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.event_id = ANY(p_event_ids)
      AND COALESCE(delivery.payload_json ->> 'materializationFingerprint', '') !~ '^[0-9a-f]{32}$'
  ) THEN RETURN false; END IF;

  UPDATE integrator.user_reminder_occurrences AS candidate
  SET status = 'queued', queued_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE candidate.id = occurrence.id
    AND candidate.delivery_generation = occurrence.delivery_generation
    AND candidate.status IN ('planned', 'queued');
  RETURN FOUND;
END
$function$;

REVOKE ALL ON FUNCTION app.mark_patient_reminder_occurrence_queued(text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_patient_reminder_occurrence_queued(text, integer, text[]) TO app_staff;

CREATE OR REPLACE FUNCTION app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  occurrence integrator.user_reminder_occurrences%ROWTYPE;
  rule public.reminder_rules%ROWTYPE;
  expected_fingerprint text;
  current_fingerprint text;
  resolved_topic_code text;
  recipient text;
  channel_allowed boolean;
BEGIN
  SELECT * INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
    AND candidate.kind = 'reminder_dispatch'
    AND candidate.status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = delivery.payload_json ->> 'occurrenceId';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO rule
  FROM public.reminder_rules AS candidate
  WHERE candidate.integrator_rule_id = occurrence.rule_id;
  IF NOT FOUND THEN RETURN false; END IF;

  resolved_topic_code := delivery.payload_json ->> 'topicCode';
  recipient := CASE delivery.channel
    WHEN 'telegram' THEN delivery.payload_json #>> '{intent,payload,recipient,chatId}'
    WHEN 'max' THEN delivery.payload_json #>> '{intent,payload,recipient,userId}'
    WHEN 'email' THEN delivery.payload_json #>> '{intent,payload,recipient,email}'
    WHEN 'web_push' THEN delivery.payload_json #>> '{intent,payload,recipient,pushUserId}'
    ELSE NULL
  END;
  expected_fingerprint := delivery.payload_json ->> 'materializationFingerprint';
  current_fingerprint := app.patient_reminder_materialization_fingerprint(occurrence.id, delivery.channel);
  channel_allowed := CASE delivery.channel
    WHEN 'telegram' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'telegram'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'max' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'max'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'email' THEN EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id AND patient.email = recipient
        AND patient.email_verified_at IS NOT NULL
    )
    WHEN 'web_push' THEN recipient = occurrence.platform_user_id::text AND EXISTS (
      SELECT 1 FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = occurrence.platform_user_id
    )
    ELSE false
  END;

  IF delivery.organization_id = occurrence.organization_id
    AND occurrence.organization_id = rule.organization_id
    AND occurrence.platform_user_id = rule.platform_user_id
    AND resolved_topic_code = rule.notification_topic_code
    AND delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
    )
    AND (delivery.payload_json ->> 'deliveryGeneration')::integer = occurrence.delivery_generation
    AND delivery.payload_json ->> 'channel' = delivery.channel
    AND delivery.payload_json ->> 'externalId' = recipient
    AND occurrence.status IN ('queued', 'sent')
    AND rule.is_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reminder_journal AS journal
      WHERE journal.occurrence_id = occurrence.id AND journal.action IN ('done', 'skipped')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = occurrence.platform_user_id
        AND preference.channel_code = delivery.channel
        AND preference.is_enabled_for_notifications = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topics AS topic
      WHERE topic.user_id = occurrence.platform_user_id
        AND topic.topic_code = resolved_topic_code AND topic.is_enabled = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = occurrence.platform_user_id
        AND preference.topic_code = resolved_topic_code AND preference.channel_code = delivery.channel
        AND preference.is_enabled = false
    )
    AND channel_allowed
    AND expected_fingerprint ~ '^[0-9a-f]{32}$'
    AND current_fingerprint = expected_fingerprint
  THEN RETURN true; END IF;
  RETURN false;
END
$function$;

REVOKE ALL ON FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid)
  TO app_operational_delivery_worker;
