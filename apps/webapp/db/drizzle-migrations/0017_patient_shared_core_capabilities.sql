-- TEMPORARY LOCAL MIGRATION NUMBER 0017
-- Patient/B0 shared-core: every patient mutation is a use-case root which derives the
-- physical patient and current organization from the attested port context.

CREATE OR REPLACE FUNCTION app.create_current_patient_reminder_rule(p_rule_id text, p_payload_text text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_integrator_user_id bigint;
  v_row public.reminder_rules%ROWTYPE;
  v_payload jsonb := p_payload_text::jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR nullif(btrim(p_rule_id), '') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e
                    WHERE e.organization_id = v_org AND e.platform_user_id = v_patient
                      AND e.status = 'active') THEN
    RAISE EXCEPTION 'current_patient_reminder_rule_rejected' USING ERRCODE = 'P0001';
  END IF;
  SELECT u.integrator_user_id INTO v_integrator_user_id
  FROM public.platform_users u
  WHERE u.id = v_patient AND u.merged_into_id IS NULL AND u.role = 'client';
  INSERT INTO public.reminder_rules (
    integrator_rule_id, organization_id, platform_user_id, integrator_user_id,
    category, is_enabled, schedule_type, timezone, interval_minutes,
    window_start_minute, window_end_minute, days_mask, content_mode,
    linked_object_type, linked_object_id, custom_title, custom_text,
    schedule_data, reminder_intent, display_title, display_description,
    quiet_hours_start_minute, quiet_hours_end_minute, notification_topic_code, updated_at
  ) VALUES (
    btrim(p_rule_id), v_org, v_patient, v_integrator_user_id,
    v_payload->>'category', (v_payload->>'enabled')::boolean,
    v_payload->>'scheduleType', v_payload->>'timezone',
    (v_payload->>'intervalMinutes')::integer,
    (v_payload->>'windowStartMinute')::integer,
    (v_payload->>'windowEndMinute')::integer,
    v_payload->>'daysMask', 'none', v_payload->>'linkedObjectType',
    v_payload->>'linkedObjectId', v_payload->>'customTitle', v_payload->>'customText',
    v_payload->'scheduleData', coalesce(v_payload->>'reminderIntent', 'generic'),
    v_payload->>'displayTitle', v_payload->>'displayDescription',
    (v_payload->>'quietHoursStartMinute')::integer,
    (v_payload->>'quietHoursEndMinute')::integer,
    v_payload->>'notificationTopicCode', statement_timestamp()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.update_current_patient_reminder_rule(p_rule_id text, p_patch_text text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.reminder_rules%ROWTYPE;
  v_patch jsonb := p_patch_text::jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.reminder_rules r SET
    is_enabled = CASE WHEN v_patch ? 'enabled' THEN (v_patch->>'enabled')::boolean ELSE r.is_enabled END,
    schedule_type = CASE WHEN v_patch ? 'scheduleType' THEN v_patch->>'scheduleType' ELSE r.schedule_type END,
    interval_minutes = CASE WHEN v_patch ? 'intervalMinutes' THEN (v_patch->>'intervalMinutes')::integer ELSE r.interval_minutes END,
    window_start_minute = CASE WHEN v_patch ? 'windowStartMinute' THEN (v_patch->>'windowStartMinute')::integer ELSE r.window_start_minute END,
    window_end_minute = CASE WHEN v_patch ? 'windowEndMinute' THEN (v_patch->>'windowEndMinute')::integer ELSE r.window_end_minute END,
    days_mask = CASE WHEN v_patch ? 'daysMask' THEN v_patch->>'daysMask' ELSE r.days_mask END,
    schedule_data = CASE WHEN v_patch ? 'scheduleData' THEN v_patch->'scheduleData' ELSE r.schedule_data END,
    quiet_hours_start_minute = CASE WHEN v_patch ? 'quietHoursStartMinute' THEN (v_patch->>'quietHoursStartMinute')::integer ELSE r.quiet_hours_start_minute END,
    quiet_hours_end_minute = CASE WHEN v_patch ? 'quietHoursEndMinute' THEN (v_patch->>'quietHoursEndMinute')::integer ELSE r.quiet_hours_end_minute END,
    custom_title = CASE WHEN v_patch ? 'customTitle' THEN v_patch->>'customTitle' ELSE r.custom_title END,
    custom_text = CASE WHEN v_patch ? 'customText' THEN v_patch->>'customText' ELSE r.custom_text END,
    display_title = CASE WHEN v_patch ? 'displayTitle' THEN v_patch->>'displayTitle' ELSE r.display_title END,
    display_description = CASE WHEN v_patch ? 'displayDescription' THEN v_patch->>'displayDescription' ELSE r.display_description END,
    updated_at = statement_timestamp()
  WHERE r.integrator_rule_id = btrim(p_rule_id)
    AND r.organization_id = v_org AND r.platform_user_id = v_patient
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_reminder_rule_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.delete_current_patient_reminder_rule(p_rule_id text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  DELETE FROM public.reminder_occurrence_history h
  USING public.reminder_rules r
  WHERE r.integrator_rule_id = btrim(p_rule_id)
    AND r.organization_id = v_org AND r.platform_user_id = v_patient
    AND h.integrator_rule_id = r.integrator_rule_id
    AND h.organization_id = v_org AND h.platform_user_id = v_patient;
  DELETE FROM public.reminder_rules r
  WHERE r.integrator_rule_id = btrim(p_rule_id)
    AND r.organization_id = v_org AND r.platform_user_id = v_patient;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_reminder_journal_action(
  p_rule_id text, p_occurrence_id text, p_action text, p_snooze_until timestamp with time zone,
  p_skip_reason text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_action NOT IN ('done', 'skipped', 'snoozed') THEN
    RAISE EXCEPTION 'current_patient_reminder_action_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.reminder_journal (rule_id, occurrence_id, action, snooze_until, skip_reason, organization_id)
  SELECT r.id, nullif(btrim(p_occurrence_id), ''), p_action, p_snooze_until,
         left(nullif(btrim(p_skip_reason), ''), 500), v_org
  FROM public.reminder_rules r
  WHERE r.integrator_rule_id = btrim(p_rule_id)
    AND r.organization_id = v_org AND r.platform_user_id = v_patient
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'current_patient_reminder_rule_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_reminder_history_seen(p_occurrence_ids_json text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.reminder_occurrence_history h SET seen_at = statement_timestamp()
  WHERE h.organization_id = app.current_org_id()
    AND h.platform_user_id = app.current_patient_user_id()
    AND h.integrator_occurrence_id IN (
      SELECT jsonb_array_elements_text(p_occurrence_ids_json::jsonb)
    ) AND h.seen_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_all_current_patient_reminder_history_seen()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.reminder_occurrence_history h SET seen_at = statement_timestamp()
  WHERE h.organization_id = app.current_org_id()
    AND h.platform_user_id = app.current_patient_user_id() AND h.seen_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.set_current_patient_reminder_muted_until(p_until timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.platform_users u
  SET reminder_muted_until = p_until, updated_at = statement_timestamp()
  WHERE u.id = app.current_patient_user_id() AND u.role = 'client' AND u.merged_into_id IS NULL;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.ensure_current_patient_support_conversation()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_key text := 'webapp:organization:' || v_org::text || ':platform:' || v_patient::text;
  v_row public.support_conversations%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments e
    WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'current_patient_support_conversation_rejected' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.* INTO v_row FROM public.support_conversations c
  WHERE c.organization_id = v_org AND c.platform_user_id = v_patient
    AND c.source = 'webapp' AND c.admin_scope = 'support'
  ORDER BY (c.integrator_conversation_id = v_key) DESC, c.created_at ASC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_row); END IF;
  INSERT INTO public.support_conversations (
    organization_id, integrator_conversation_id, platform_user_id, integrator_user_id,
    source, admin_scope, status, opened_at, last_message_at
  ) VALUES (
    v_org, v_key, v_patient, NULL, 'webapp', 'support', 'open',
    statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (integrator_conversation_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        platform_user_id = EXCLUDED.platform_user_id,
        updated_at = statement_timestamp()
    WHERE support_conversations.organization_id = v_org
      AND support_conversations.platform_user_id = v_patient
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_support_conversation_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.append_current_patient_support_message(
  p_conversation_id uuid, p_integrator_message_id text, p_text text, p_source text,
  p_created_at timestamp with time zone, p_media_url text, p_media_type text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.support_conversation_messages%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF nullif(btrim(p_text), '') IS NULL OR p_source <> 'webapp' OR NOT EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = p_conversation_id AND c.organization_id = v_org
      AND c.platform_user_id = v_patient AND c.status = 'open' AND c.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_support_message_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.support_conversation_messages (
    organization_id, integrator_message_id, conversation_id, sender_role, message_type,
    text, source, created_at, delivered_at, media_url, media_type
  ) VALUES (
    v_org, btrim(p_integrator_message_id), p_conversation_id, 'user', 'text',
    p_text, p_source, p_created_at, p_created_at, p_media_url, p_media_type
  ) ON CONFLICT (integrator_message_id) DO NOTHING RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT m.* INTO v_row FROM public.support_conversation_messages m
    WHERE m.integrator_message_id = btrim(p_integrator_message_id)
      AND m.organization_id = v_org AND m.conversation_id = p_conversation_id
      AND m.sender_role = 'user';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_support_message_conflict' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.support_conversations c
  SET last_message_at = greatest(c.last_message_at, p_created_at), updated_at = statement_timestamp()
  WHERE c.id = p_conversation_id AND c.organization_id = v_org AND c.platform_user_id = v_patient;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_support_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.support_conversation_messages m SET read_at = coalesce(m.read_at, statement_timestamp())
  FROM public.support_conversations c
  WHERE m.conversation_id = c.id AND c.id = p_conversation_id
    AND c.organization_id = app.current_org_id()
    AND c.platform_user_id = app.current_patient_user_id()
    AND m.sender_role <> 'user' AND m.read_at IS NULL
    AND NOT (m.source IN ('doctor_broadcast', 'appointment_lifecycle')
      OR m.integrator_message_id LIKE 'broadcast:%'
      OR m.integrator_message_id LIKE 'booking-created:%'
      OR m.integrator_message_id LIKE 'booking-cancelled:%'
      OR m.integrator_message_id LIKE 'booking-rescheduled:%');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_support_messages_read(p_message_ids_json text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.support_conversation_messages m SET read_at = coalesce(m.read_at, statement_timestamp())
  FROM public.support_conversations c
  WHERE m.conversation_id = c.id AND m.id IN (
    SELECT jsonb_array_elements_text(p_message_ids_json::jsonb)::uuid
  )
    AND c.organization_id = app.current_org_id()
    AND c.platform_user_id = app.current_patient_user_id()
    AND m.sender_role <> 'user' AND m.read_at IS NULL
    AND NOT (m.source IN ('doctor_broadcast', 'appointment_lifecycle')
      OR m.integrator_message_id LIKE 'broadcast:%'
      OR m.integrator_message_id LIKE 'booking-created:%'
      OR m.integrator_message_id LIKE 'booking-cancelled:%'
      OR m.integrator_message_id LIKE 'booking-rescheduled:%');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_support_notifications_read()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.support_conversation_messages m SET read_at = coalesce(m.read_at, statement_timestamp())
  FROM public.support_conversations c
  WHERE m.conversation_id = c.id AND c.organization_id = app.current_org_id()
    AND c.platform_user_id = app.current_patient_user_id()
    AND m.sender_role <> 'user' AND m.read_at IS NULL
    AND (m.source IN ('doctor_broadcast', 'appointment_lifecycle')
      OR m.integrator_message_id LIKE 'broadcast:%'
      OR m.integrator_message_id LIKE 'booking-created:%'
      OR m.integrator_message_id LIKE 'booking-cancelled:%'
      OR m.integrator_message_id LIKE 'booking-rescheduled:%');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.ensure_current_patient_system_symptom_tracking(
  p_symptom_key text, p_title text, p_symptom_type_ref_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.symptom_trackings%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_symptom_key NOT IN ('general_wellbeing', 'warmup_feeling')
     OR nullif(btrim(p_title), '') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.reference_items ri
                    JOIN public.reference_categories rc ON rc.id = ri.category_id
                    WHERE ri.id = p_symptom_type_ref_id AND ri.is_active
                      AND rc.code = 'symptom_type'
                      AND (ri.organization_id = v_org OR ri.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'current_patient_system_symptom_tracking_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF p_symptom_key = 'general_wellbeing' THEN
    INSERT INTO public.symptom_trackings (
      organization_id, user_id, platform_user_id, symptom_key, symptom_title,
      is_active, updated_at, symptom_type_ref_id
    ) VALUES (
      v_org, v_patient::text, v_patient, 'general_wellbeing', btrim(p_title), true,
      statement_timestamp(), p_symptom_type_ref_id
    ) ON CONFLICT (platform_user_id) WHERE (
      symptom_key = 'general_wellbeing' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
    ) DO UPDATE SET updated_at = symptom_trackings.updated_at
      WHERE symptom_trackings.platform_user_id = v_patient
        AND (symptom_trackings.organization_id = v_org OR symptom_trackings.organization_id IS NULL)
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.symptom_trackings (
      organization_id, user_id, platform_user_id, symptom_key, symptom_title,
      is_active, updated_at, symptom_type_ref_id
    ) VALUES (
      v_org, v_patient::text, v_patient, 'warmup_feeling', btrim(p_title), true,
      statement_timestamp(), p_symptom_type_ref_id
    ) ON CONFLICT (platform_user_id) WHERE (
      symptom_key = 'warmup_feeling' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
    ) DO UPDATE SET updated_at = symptom_trackings.updated_at
      WHERE symptom_trackings.platform_user_id = v_patient
        AND (symptom_trackings.organization_id = v_org OR symptom_trackings.organization_id IS NULL)
    RETURNING * INTO v_row;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_system_symptom_tracking_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_symptom_entry(
  p_tracking_id uuid, p_value integer, p_entry_type text,
  p_recorded_at timestamp with time zone, p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.symptom_entries%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_value < 0 OR p_value > 10 OR p_entry_type NOT IN ('instant', 'daily')
     OR p_recorded_at > statement_timestamp() + interval '1 minute'
     OR NOT EXISTS (SELECT 1 FROM public.symptom_trackings t
                    WHERE t.id = p_tracking_id AND t.organization_id = v_org
                      AND t.platform_user_id = v_patient AND t.deleted_at IS NULL AND t.is_active) THEN
    RAISE EXCEPTION 'current_patient_symptom_entry_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.symptom_entries (
    organization_id, user_id, platform_user_id, tracking_id, value_0_10,
    entry_type, recorded_at, source, notes
  ) VALUES (
    v_org, v_patient::text, v_patient, p_tracking_id, p_value,
    p_entry_type, p_recorded_at, 'webapp', left(p_notes, 2000)
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.update_current_patient_symptom_entry(
  p_entry_id uuid, p_value integer, p_entry_type text,
  p_recorded_at timestamp with time zone, p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.symptom_entries%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_value < 0 OR p_value > 10 OR p_entry_type NOT IN ('instant', 'daily') THEN
    RAISE EXCEPTION 'current_patient_symptom_entry_rejected' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.symptom_entries e SET value_0_10 = p_value, entry_type = p_entry_type,
    recorded_at = p_recorded_at, notes = left(p_notes, 2000)
  FROM public.symptom_trackings t
  WHERE e.id = p_entry_id AND e.tracking_id = t.id
    AND e.organization_id = app.current_org_id()
    AND e.platform_user_id = app.current_patient_user_id()
    AND t.organization_id = app.current_org_id()
    AND t.platform_user_id = app.current_patient_user_id()
    AND t.deleted_at IS NULL
    AND e.recorded_at >= statement_timestamp() - interval '24 hours'
  RETURNING e.* INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_symptom_entry_not_editable' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.delete_current_patient_symptom_entry(p_entry_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  DELETE FROM public.symptom_entries e USING public.symptom_trackings t
  WHERE e.id = p_entry_id AND e.tracking_id = t.id
    AND e.organization_id = app.current_org_id()
    AND e.platform_user_id = app.current_patient_user_id()
    AND t.organization_id = app.current_org_id()
    AND t.platform_user_id = app.current_patient_user_id()
    AND t.deleted_at IS NULL AND t.symptom_key IS DISTINCT FROM 'general_wellbeing'
    AND e.recorded_at >= statement_timestamp() - interval '24 hours';
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.configure_current_patient_assigned_symptom_tracking(
  p_tracking_id uuid, p_title text, p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.symptom_trackings t SET
    symptom_title = CASE WHEN p_title IS NULL THEN t.symptom_title ELSE btrim(p_title) END,
    is_active = coalesce(p_is_active, t.is_active), updated_at = statement_timestamp()
  WHERE t.id = p_tracking_id AND t.organization_id = app.current_org_id()
    AND t.platform_user_id = app.current_patient_user_id() AND t.deleted_at IS NULL
    AND t.symptom_key IS DISTINCT FROM 'general_wellbeing'
    AND t.symptom_key IS DISTINCT FROM 'warmup_feeling'
    AND (p_title IS NULL OR nullif(btrim(p_title), '') IS NOT NULL);
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.apply_current_patient_warmup_feeling(
  p_completion_id uuid, p_feeling integer, p_warmup_ref_id uuid, p_warmup_title text,
  p_general_ref_id uuid, p_general_title text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_completed_at timestamp with time zone;
  v_warmup_tracking uuid;
  v_general_tracking uuid;
  v_inserted boolean := false;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT c.completed_at INTO v_completed_at
  FROM public.patient_practice_completions c
  WHERE c.id = p_completion_id AND c.organization_id = v_org
    AND c.user_id = v_patient AND c.source = 'daily_warmup' FOR UPDATE;
  IF NOT FOUND OR p_feeling NOT IN (1, 3, 5) THEN
    RAISE EXCEPTION 'current_patient_warmup_feeling_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(p_warmup_title), '') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.reference_items ri
    JOIN public.reference_categories rc ON rc.id = ri.category_id
    WHERE ri.id = p_warmup_ref_id AND ri.is_active AND rc.code = 'symptom_type'
      AND (ri.organization_id = v_org OR ri.organization_id IS NULL)
  ) OR (p_general_ref_id IS NOT NULL AND (
    nullif(btrim(p_general_title), '') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.reference_items ri
      JOIN public.reference_categories rc ON rc.id = ri.category_id
      WHERE ri.id = p_general_ref_id AND ri.is_active AND rc.code = 'symptom_type'
        AND (ri.organization_id = v_org OR ri.organization_id IS NULL)
    )
  )) THEN
    RAISE EXCEPTION 'current_patient_warmup_reference_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.symptom_trackings (
    organization_id, user_id, platform_user_id, symptom_key, symptom_title,
    is_active, updated_at, symptom_type_ref_id
  ) VALUES (
    v_org, v_patient::text, v_patient, 'warmup_feeling', btrim(p_warmup_title),
    true, statement_timestamp(), p_warmup_ref_id
  ) ON CONFLICT (platform_user_id) WHERE (
    symptom_key = 'warmup_feeling' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
  ) DO UPDATE SET updated_at = symptom_trackings.updated_at
  RETURNING id INTO v_warmup_tracking;
  INSERT INTO public.symptom_entries (
    organization_id, user_id, platform_user_id, tracking_id, value_0_10,
    entry_type, recorded_at, source, notes, patient_practice_completion_id
  ) VALUES (
    v_org, v_patient::text, v_patient, v_warmup_tracking, p_feeling,
    'instant', v_completed_at, 'webapp', NULL, p_completion_id
  ) ON CONFLICT (patient_practice_completion_id) WHERE patient_practice_completion_id IS NOT NULL
    DO NOTHING;
  v_inserted := FOUND;
  IF v_inserted AND p_general_ref_id IS NOT NULL AND nullif(btrim(p_general_title), '') IS NOT NULL THEN
    INSERT INTO public.symptom_trackings (
      organization_id, user_id, platform_user_id, symptom_key, symptom_title,
      is_active, updated_at, symptom_type_ref_id
    ) VALUES (
      v_org, v_patient::text, v_patient, 'general_wellbeing', btrim(p_general_title),
      true, statement_timestamp(), p_general_ref_id
    ) ON CONFLICT (platform_user_id) WHERE (
      symptom_key = 'general_wellbeing' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
    ) DO UPDATE SET updated_at = symptom_trackings.updated_at
    RETURNING id INTO v_general_tracking;
    INSERT INTO public.symptom_entries (
      organization_id, user_id, platform_user_id, tracking_id, value_0_10,
      entry_type, recorded_at, source, notes
    ) VALUES (
      v_org, v_patient::text, v_patient, v_general_tracking, p_feeling,
      'instant', v_completed_at, 'webapp', '__bcc_warmup_general_mirror__'
    );
  END IF;
  UPDATE public.patient_practice_completions c SET feeling = p_feeling
  WHERE c.id = p_completion_id AND c.organization_id = v_org AND c.user_id = v_patient;
  RETURN NOT v_inserted;
END
$function$;

CREATE OR REPLACE FUNCTION app.save_current_patient_channel_preference(
  p_channel text, p_messages boolean, p_notifications boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_patient uuid := app.current_patient_user_id(); v_row public.user_channel_preferences%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_channel NOT IN ('telegram', 'max', 'vk', 'sms', 'email', 'web_push') THEN
    RAISE EXCEPTION 'current_patient_channel_preference_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.user_channel_preferences (
    user_id, platform_user_id, channel_code, is_enabled_for_messages,
    is_enabled_for_notifications, updated_at
  ) VALUES (
    v_patient::text, v_patient, p_channel, p_messages, p_notifications, statement_timestamp()
  ) ON CONFLICT (user_id, channel_code) DO UPDATE SET
    platform_user_id = EXCLUDED.platform_user_id,
    is_enabled_for_messages = EXCLUDED.is_enabled_for_messages,
    is_enabled_for_notifications = EXCLUDED.is_enabled_for_notifications,
    updated_at = EXCLUDED.updated_at
  WHERE user_channel_preferences.platform_user_id = v_patient
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_channel_preference_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.set_current_patient_preferred_auth_channel(p_channel text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_channel IS NOT NULL AND p_channel NOT IN ('telegram', 'max', 'email', 'sms') THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel IN ('telegram', 'max') AND NOT EXISTS (
    SELECT 1 FROM public.user_channel_bindings b
    WHERE b.user_id = v_patient AND b.channel_code = p_channel
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unlinked' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel = 'email' AND NOT EXISTS (
    SELECT 1 FROM public.platform_users u WHERE u.id = v_patient AND u.email_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unverified' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel = 'sms' AND NOT EXISTS (
    SELECT 1 FROM public.user_phone_history h WHERE h.platform_user_id = v_patient AND h.valid_to IS NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unverified' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.user_channel_preferences p SET is_preferred_for_auth = false,
    updated_at = statement_timestamp()
  WHERE p.platform_user_id = v_patient;
  IF p_channel IS NOT NULL THEN
    INSERT INTO public.user_channel_preferences (
      user_id, platform_user_id, channel_code, is_enabled_for_messages,
      is_enabled_for_notifications, is_preferred_for_auth, updated_at
    ) VALUES (
      v_patient::text, v_patient, p_channel, true, true, true, statement_timestamp()
    ) ON CONFLICT (user_id, channel_code) DO UPDATE SET
      platform_user_id = EXCLUDED.platform_user_id,
      is_preferred_for_auth = true, updated_at = EXCLUDED.updated_at
    WHERE user_channel_preferences.platform_user_id = v_patient;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'current_patient_preferred_auth_channel_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.save_current_patient_web_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF EXISTS (SELECT 1 FROM public.user_web_push_subscriptions s
             WHERE s.endpoint = p_endpoint AND s.user_id <> v_patient) THEN
    RAISE EXCEPTION 'web_push_endpoint_owned_by_another_user' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.user_web_push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent, updated_at
  ) VALUES (
    v_patient, p_endpoint, p_p256dh, p_auth, nullif(btrim(p_user_agent), ''), statement_timestamp()
  ) ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent, updated_at = EXCLUDED.updated_at
    WHERE user_web_push_subscriptions.user_id = v_patient;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'web_push_endpoint_owned_by_another_user' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.user_web_push_subscriptions s
  WHERE s.user_id = v_patient AND s.id NOT IN (
    SELECT recent.id FROM public.user_web_push_subscriptions recent
    WHERE recent.user_id = v_patient
    ORDER BY recent.updated_at DESC, recent.created_at DESC LIMIT 5
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.remove_current_patient_web_push_subscription(p_endpoint text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  DELETE FROM public.user_web_push_subscriptions s
  WHERE s.user_id = app.current_patient_user_id() AND s.endpoint = p_endpoint;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.remove_all_current_patient_web_push_subscriptions()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  DELETE FROM public.user_web_push_subscriptions s
  WHERE s.user_id = app.current_patient_user_id();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.touch_current_patient_program_item(
  p_instance_id uuid, p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_stage public.treatment_program_instance_stages%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT s.* INTO v_stage
  FROM public.treatment_program_instance_stages s
  JOIN public.treatment_program_instance_stage_items si ON si.stage_id = s.id
  JOIN public.treatment_program_instances i ON i.id = s.instance_id
  WHERE i.id = p_instance_id AND si.id = p_item_id
    AND i.organization_id = v_org AND i.patient_user_id = v_patient AND i.status = 'active'
    AND s.organization_id = v_org AND si.organization_id = v_org
    AND si.status = 'active' AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
  FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_program_item_not_accessible' USING ERRCODE = 'P0001';
  END IF;
  IF v_stage.status = 'available' THEN
    UPDATE public.treatment_program_instance_stages s
    SET status = 'in_progress', started_at = coalesce(s.started_at, statement_timestamp())
    WHERE s.id = v_stage.id RETURNING * INTO v_stage;
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage', v_stage.id,
      jsonb_build_object('scope', 'stage', 'from', 'available', 'to', 'in_progress')
    );
  END IF;
  RETURN to_jsonb(v_stage);
END
$function$;

CREATE OR REPLACE FUNCTION app.complete_current_patient_program_item(
  p_instance_id uuid, p_item_id uuid, p_repeat_cooldown_minutes integer, p_metrics_text text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_item public.treatment_program_instance_stage_items%ROWTYPE;
  v_stage public.treatment_program_instance_stages%ROWTYPE;
  v_completion_id uuid;
  v_created_at timestamp with time zone;
  v_now timestamp with time zone := statement_timestamp();
  v_payload jsonb;
  v_metrics jsonb := p_metrics_text::jsonb;
  v_had_completed boolean;
  v_cooldown integer := least(180, greatest(5, p_repeat_cooldown_minutes));
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT si.* INTO v_item
  FROM public.treatment_program_instance_stage_items si
  JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
  JOIN public.treatment_program_instances i ON i.id = s.instance_id
  WHERE i.id = p_instance_id AND si.id = p_item_id
    AND i.organization_id = v_org AND i.patient_user_id = v_patient AND i.status = 'active'
    AND s.organization_id = v_org AND si.organization_id = v_org
    AND si.status = 'active' AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
    AND si.item_type <> 'clinical_test'
    AND NOT (si.item_type = 'recommendation' AND si.is_actionable = false)
  FOR UPDATE OF si, s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_program_item_not_completable' USING ERRCODE = 'P0001';
  END IF;
  SELECT s.* INTO STRICT v_stage
  FROM public.treatment_program_instance_stages s
  WHERE s.id = v_item.stage_id;
  IF EXISTS (
    SELECT 1 FROM public.program_action_log l
    WHERE l.organization_id = v_org AND l.patient_user_id = v_patient
      AND l.instance_id = p_instance_id AND l.instance_stage_item_id = p_item_id
      AND l.action_type = 'done' AND l.payload->>'source' = 'simple_item_complete'
      AND l.created_at > v_now - make_interval(mins => v_cooldown)
  ) THEN
    RAISE EXCEPTION 'completion_cooldown_active' USING ERRCODE = 'P0001';
  END IF;
  IF v_metrics ? 'perceivedDifficulty'
     AND v_metrics->>'perceivedDifficulty' NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'completion_metrics_invalid' USING ERRCODE = 'P0001';
  END IF;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'source', 'simple_item_complete', 'itemType', v_item.item_type,
    'perceivedDifficulty', v_metrics->'perceivedDifficulty',
    'reps', v_metrics->'reps', 'sets', v_metrics->'sets', 'weightKg', v_metrics->'weightKg'
  ));
  v_had_completed := v_item.completed_at IS NOT NULL;
  IF v_stage.status = 'available' THEN
    UPDATE public.treatment_program_instance_stages s
    SET status = 'in_progress', started_at = coalesce(s.started_at, v_now)
    WHERE s.id = v_stage.id;
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage', v_stage.id,
      jsonb_build_object('scope', 'stage', 'from', 'available', 'to', 'in_progress')
    );
  END IF;
  UPDATE public.treatment_program_instance_stage_items si SET completed_at = v_now
  WHERE si.id = p_item_id;
  UPDATE public.treatment_program_instances i SET updated_at = v_now
  WHERE i.id = p_instance_id AND i.organization_id = v_org AND i.patient_user_id = v_patient;
  INSERT INTO public.program_action_log (
    organization_id, instance_id, instance_stage_item_id, patient_user_id,
    session_id, action_type, payload, note, created_at
  ) VALUES (
    v_org, p_instance_id, p_item_id, v_patient, NULL, 'done', v_payload, NULL, v_now
  ) RETURNING id, created_at INTO v_completion_id, v_created_at;
  IF NOT v_had_completed THEN
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage_item', p_item_id,
      jsonb_build_object('scope', 'stage_item', 'field', 'completedAt',
                         'value', v_now, 'stageId', v_stage.id)
    );
  END IF;
  RETURN jsonb_build_object('id', v_completion_id, 'createdAt', v_created_at,
                            'payload', v_payload, 'hadCompleted', v_had_completed);
END
$function$;

CREATE OR REPLACE FUNCTION app.enrich_current_patient_program_completion(
  p_completion_id uuid, p_instance_id uuid, p_item_id uuid, p_metrics_text text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_row public.program_action_log%ROWTYPE;
  v_metrics jsonb := p_metrics_text::jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF v_metrics ? 'perceivedDifficulty'
     AND v_metrics->>'perceivedDifficulty' NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'completion_metrics_invalid' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.program_action_log l
  SET payload = coalesce(l.payload, '{}'::jsonb) || jsonb_strip_nulls(v_metrics)
  WHERE l.id = p_completion_id AND l.organization_id = app.current_org_id()
    AND l.patient_user_id = app.current_patient_user_id()
    AND l.instance_id = p_instance_id AND l.instance_stage_item_id = p_item_id
    AND l.action_type = 'done' AND l.payload->>'source' = 'simple_item_complete'
    AND EXISTS (
      SELECT 1 FROM public.treatment_program_instance_stage_items si
      JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
      JOIN public.treatment_program_instances i ON i.id = s.instance_id
      WHERE si.id = p_item_id AND i.id = p_instance_id
        AND i.organization_id = app.current_org_id()
        AND i.patient_user_id = app.current_patient_user_id()
    )
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_program_action(
  p_instance_id uuid, p_item_id uuid, p_action_type text, p_session_id uuid,
  p_payload_text text, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.program_action_log%ROWTYPE;
  v_payload jsonb := p_payload_text::jsonb;
  v_source text := v_payload->>'source';
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_action_type NOT IN ('done', 'viewed', 'note')
     OR v_source NOT IN ('checklist_toggle', 'patient_observation', 'patient_media',
                         'test_submitted', 'lfk_exercise_done')
     OR (p_action_type = 'note' AND nullif(btrim(p_note), '') IS NULL
         AND v_source <> 'patient_media')
     OR NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instance_stage_items si
       JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
       JOIN public.treatment_program_instances i ON i.id = s.instance_id
       WHERE si.id = p_item_id AND i.id = p_instance_id
         AND i.organization_id = v_org AND i.patient_user_id = v_patient AND i.status = 'active'
         AND si.organization_id = v_org AND s.organization_id = v_org AND si.status = 'active'
         AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
     ) THEN
    RAISE EXCEPTION 'current_patient_program_action_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF v_source = 'patient_media' AND NOT EXISTS (
    SELECT 1 FROM public.media_files m
    WHERE m.id = (v_payload->>'mediaFileId')::uuid AND m.organization_id = v_org
      AND m.uploaded_by = v_patient AND m.usage_purpose = 'program_item_submission'
  ) THEN
    RAISE EXCEPTION 'current_patient_program_media_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.program_action_log (
    organization_id, instance_id, instance_stage_item_id, patient_user_id,
    session_id, action_type, payload, note
  ) VALUES (
    v_org, p_instance_id, p_item_id, v_patient, p_session_id,
    p_action_type, v_payload, left(p_note, 4000)
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.delete_current_patient_program_actions_in_window(
  p_instance_id uuid, p_item_id uuid, p_window_start timestamp with time zone,
  p_window_end timestamp with time zone, p_include_special boolean
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  DELETE FROM public.program_action_log l
  WHERE l.organization_id = app.current_org_id()
    AND l.patient_user_id = app.current_patient_user_id()
    AND l.instance_id = p_instance_id AND l.instance_stage_item_id = p_item_id
    AND l.action_type = 'done' AND l.created_at >= p_window_start AND l.created_at < p_window_end
    AND (p_include_special OR coalesce(l.payload->>'source', '') NOT IN ('test_submitted', 'lfk_exercise_done'))
    AND EXISTS (
      SELECT 1 FROM public.treatment_program_instance_stage_items si
      JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
      JOIN public.treatment_program_instances i ON i.id = s.instance_id
      WHERE si.id = p_item_id AND i.id = p_instance_id
        AND i.organization_id = app.current_org_id()
        AND i.patient_user_id = app.current_patient_user_id()
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.append_current_patient_program_event(
  p_instance_id uuid, p_event_type text, p_target_type text, p_target_id uuid,
  p_payload_text text, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.treatment_program_events%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_event_type NOT IN ('status_changed', 'test_completed')
     OR p_target_type NOT IN ('stage', 'stage_item', 'program')
     OR NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instances i
       WHERE i.id = p_instance_id AND i.organization_id = app.current_org_id()
         AND i.patient_user_id = app.current_patient_user_id()
     )
     OR (p_target_type = 'stage' AND NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instance_stages s
       WHERE s.id = p_target_id AND s.instance_id = p_instance_id
         AND s.organization_id = app.current_org_id()
     ))
     OR (p_target_type = 'stage_item' AND NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instance_stage_items si
       JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
       WHERE si.id = p_target_id AND s.instance_id = p_instance_id
         AND si.organization_id = app.current_org_id()
     )) THEN
    RAISE EXCEPTION 'current_patient_program_event_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.treatment_program_events (
    organization_id, instance_id, actor_id, event_type, target_type, target_id, payload, reason
  ) VALUES (
    app.current_org_id(), p_instance_id, app.current_patient_user_id(),
    p_event_type, p_target_type, p_target_id, coalesce(p_payload_text::jsonb, '{}'::jsonb), p_reason
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_program_item_viewed(
  p_instance_id uuid, p_item_id uuid
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.treatment_program_instance_stage_items si
  SET last_viewed_at = statement_timestamp()
  FROM public.treatment_program_instance_stages s, public.treatment_program_instances i
  WHERE si.id = p_item_id AND si.stage_id = s.id AND s.instance_id = i.id
    AND i.id = p_instance_id AND i.organization_id = app.current_org_id()
    AND i.patient_user_id = app.current_patient_user_id()
    AND si.organization_id = app.current_org_id() AND si.last_viewed_at IS NULL;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.append_current_patient_program_discussion(
  p_item_id uuid, p_body text, p_media_file_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.program_item_discussion_messages%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF nullif(btrim(p_body), '') IS NULL AND p_media_file_id IS NULL THEN
    RAISE EXCEPTION 'current_patient_program_discussion_empty' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.treatment_program_instance_stage_items si
    JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
    JOIN public.treatment_program_instances i ON i.id = s.instance_id
    WHERE si.id = p_item_id AND si.organization_id = app.current_org_id()
      AND i.organization_id = app.current_org_id()
      AND i.patient_user_id = app.current_patient_user_id()
      AND i.assignment_source = 'doctor' AND i.status = 'active'
      AND si.status = 'active' AND si.item_type <> 'clinical_test'
      AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
  ) OR (p_media_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.media_files m WHERE m.id = p_media_file_id
      AND m.organization_id = app.current_org_id()
      AND m.uploaded_by = app.current_patient_user_id()
      AND m.usage_purpose = 'program_item_submission'
  )) THEN
    RAISE EXCEPTION 'current_patient_program_discussion_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.program_item_discussion_messages (
    organization_id, instance_stage_item_id, patient_user_id, sender_role,
    origin, body, media_file_id
  ) VALUES (
    app.current_org_id(), p_item_id, app.current_patient_user_id(), 'patient',
    'patient_observation', left(nullif(btrim(p_body), ''), 4000), p_media_file_id
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.mark_current_patient_program_discussion_read(
  p_item_id uuid, p_last_read_at timestamp with time zone
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.treatment_program_instance_stage_items si
    JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
    JOIN public.treatment_program_instances i ON i.id = s.instance_id
    WHERE si.id = p_item_id AND i.organization_id = app.current_org_id()
      AND i.patient_user_id = app.current_patient_user_id()
  ) THEN
    RAISE EXCEPTION 'current_patient_program_discussion_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.program_item_discussion_reads (
    organization_id, patient_user_id, instance_stage_item_id, last_read_at
  ) VALUES (
    app.current_org_id(), app.current_patient_user_id(), p_item_id,
    least(coalesce(p_last_read_at, statement_timestamp()), statement_timestamp())
  ) ON CONFLICT (patient_user_id, instance_stage_item_id) DO UPDATE
  SET last_read_at = greatest(program_item_discussion_reads.last_read_at, EXCLUDED.last_read_at)
  WHERE program_item_discussion_reads.patient_user_id = app.current_patient_user_id();
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.ensure_current_patient_test_attempt(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.test_attempts%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.treatment_program_instance_stage_items si
    JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
    JOIN public.treatment_program_instances i ON i.id = s.instance_id
    WHERE si.id = p_item_id AND si.item_type = 'clinical_test' AND si.status = 'active'
      AND i.organization_id = app.current_org_id()
      AND i.patient_user_id = app.current_patient_user_id() AND i.status = 'active'
      AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
  ) THEN
    RAISE EXCEPTION 'current_patient_test_attempt_rejected' USING ERRCODE = 'P0001';
  END IF;
  SELECT a.* INTO v_row FROM public.test_attempts a
  WHERE a.instance_stage_item_id = p_item_id
    AND a.patient_user_id = app.current_patient_user_id() AND a.submitted_at IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_row); END IF;
  INSERT INTO public.test_attempts (
    organization_id, instance_stage_item_id, patient_user_id, started_at
  ) VALUES (
    app.current_org_id(), p_item_id, app.current_patient_user_id(), statement_timestamp()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.start_current_patient_test_attempt(
  p_instance_id uuid, p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.test_attempts%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.treatment_program_instance_stage_items si
    JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
    JOIN public.treatment_program_instances i ON i.id = s.instance_id
    WHERE si.id = p_item_id AND i.id = p_instance_id AND si.item_type = 'clinical_test'
      AND si.status = 'active' AND i.organization_id = app.current_org_id()
      AND i.patient_user_id = app.current_patient_user_id() AND i.status = 'active'
      AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
  ) OR EXISTS (
    SELECT 1 FROM public.test_attempts a WHERE a.instance_stage_item_id = p_item_id
      AND a.patient_user_id = app.current_patient_user_id() AND a.submitted_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.test_attempts a WHERE a.instance_stage_item_id = p_item_id
      AND a.patient_user_id = app.current_patient_user_id() AND a.submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_test_attempt_start_rejected' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.treatment_program_instance_stage_items si SET completed_at = NULL
  WHERE si.id = p_item_id;
  INSERT INTO public.test_attempts (
    organization_id, instance_stage_item_id, patient_user_id, started_at
  ) VALUES (
    app.current_org_id(), p_item_id, app.current_patient_user_id(), statement_timestamp()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.save_current_patient_test_result(
  p_attempt_id uuid, p_test_id uuid, p_raw_value_text text, p_normalized_decision text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_row public.test_results%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  IF p_normalized_decision NOT IN ('passed', 'failed', 'partial') OR NOT EXISTS (
    SELECT 1 FROM public.test_attempts a
    JOIN public.treatment_program_instance_stage_items si ON si.id = a.instance_stage_item_id
    JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
    JOIN public.treatment_program_instances i ON i.id = s.instance_id
    WHERE a.id = p_attempt_id AND a.patient_user_id = app.current_patient_user_id()
      AND a.organization_id = app.current_org_id() AND a.submitted_at IS NULL
      AND i.organization_id = app.current_org_id()
      AND i.patient_user_id = app.current_patient_user_id()
      AND si.item_type = 'clinical_test' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(si.snapshot->'tests', '[]'::jsonb)) test(value)
        WHERE test.value->>'testId' = p_test_id::text
      )
  ) THEN
    RAISE EXCEPTION 'current_patient_test_result_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.test_results (
    organization_id, attempt_id, test_id, raw_value, normalized_decision, decided_by
  ) VALUES (
    app.current_org_id(), p_attempt_id, p_test_id, p_raw_value_text::jsonb, p_normalized_decision, NULL
  ) ON CONFLICT (attempt_id, test_id) DO UPDATE SET
    raw_value = EXCLUDED.raw_value, normalized_decision = EXCLUDED.normalized_decision,
    decided_by = NULL
  WHERE test_results.organization_id = app.current_org_id()
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_test_result_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;

CREATE OR REPLACE FUNCTION app.submit_current_patient_test_attempt(p_attempt_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  UPDATE public.test_attempts a SET submitted_at = statement_timestamp()
  FROM public.treatment_program_instance_stage_items si,
       public.treatment_program_instance_stages s,
       public.treatment_program_instances i
  WHERE a.id = p_attempt_id AND a.instance_stage_item_id = si.id
    AND si.stage_id = s.id AND s.instance_id = i.id
    AND a.patient_user_id = app.current_patient_user_id()
    AND a.organization_id = app.current_org_id() AND a.submitted_at IS NULL
    AND i.organization_id = app.current_org_id()
    AND i.patient_user_id = app.current_patient_user_id()
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(si.snapshot->'tests', '[]'::jsonb)) test(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.test_results r
        WHERE r.attempt_id = a.id AND r.test_id::text = test.value->>'testId'
      )
    );
  RETURN FOUND;
END
$function$;
