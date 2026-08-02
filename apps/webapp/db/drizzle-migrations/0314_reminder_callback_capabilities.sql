-- 0314: D7 callback capabilities for reminder state under the installed principal.
--
-- The integrator supplies only callback facts. Each function derives the patient from the locked
-- principal context and requires the exact organization plus an active enrollment before touching
-- canonical public state. No direct public table grant is added for the integrator runtime role.

DO $d7_reminder_capability_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, UPDATE ON TABLE public.reminder_occurrence_history TO app_owner;
    GRANT SELECT ON TABLE public.reminder_rules TO app_owner;
    GRANT SELECT, INSERT ON TABLE public.reminder_journal TO app_owner;
    GRANT SELECT, UPDATE ON TABLE public.platform_users TO app_owner;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_notification_topic_channels TO app_owner;
    GRANT SELECT ON TABLE public.user_channel_bindings, public.user_channel_preferences,
      public.user_web_push_subscriptions, public.org_enrollments, public.app_runtime_settings TO app_owner;
  END IF;
END
$d7_reminder_capability_owner_grants$;

-- Existing patient API capability. In addition to its signed patient-session path, accept an
-- installed integrator principal only when it has an exact active organization enrollment.
CREATE OR REPLACE FUNCTION app.patient_snooze_reminder_occurrence(
  p_platform_user_id uuid,
  p_integrator_occurrence_id text,
  p_minutes integer
)
RETURNS TABLE (snoozed_until timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_rule_id uuid;
BEGIN
  IF p_minutes NOT BETWEEN 1 AND 720 THEN RETURN; END IF;

  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id
          AND enrollment.status = 'active'
      )
    LIMIT 1;
    IF v_platform_user_id IS NULL THEN RETURN; END IF;
  ELSE
    RETURN;
  END IF;

  UPDATE public.reminder_occurrence_history AS occurrence
  SET snoozed_at = statement_timestamp(),
      snoozed_until = statement_timestamp() + make_interval(mins => p_minutes)
  FROM public.reminder_rules AS rule
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_rule_id = rule.integrator_rule_id
    AND occurrence.skipped_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = v_platform_user_id
        AND patient.integrator_user_id = occurrence.integrator_user_id
    )
    AND (
      v_patient_user_id IS NOT NULL
      OR (
        occurrence.integrator_user_id = v_integrator_user_id
        AND occurrence.organization_id = v_org_id
        AND rule.organization_id = v_org_id
      )
    )
  RETURNING occurrence.snoozed_until, rule.id INTO snoozed_until, v_rule_id;

  IF snoozed_until IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, snooze_until)
  VALUES (v_org_id, v_rule_id, p_integrator_occurrence_id, 'snoozed', snoozed_until)
  ON CONFLICT DO NOTHING;

  RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION app.patient_skip_reminder_occurrence(
  p_platform_user_id uuid,
  p_integrator_occurrence_id text,
  p_reason text
)
RETURNS TABLE (skipped_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_rule_id uuid;
BEGIN
  IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN RETURN; END IF;

  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id
          AND enrollment.status = 'active'
      )
    LIMIT 1;
    IF v_platform_user_id IS NULL THEN RETURN; END IF;
  ELSE
    RETURN;
  END IF;

  UPDATE public.reminder_occurrence_history AS occurrence
  SET skipped_at = COALESCE(occurrence.skipped_at, statement_timestamp()),
      skip_reason = CASE WHEN occurrence.skipped_at IS NULL THEN p_reason ELSE occurrence.skip_reason END
  FROM public.reminder_rules AS rule
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_rule_id = rule.integrator_rule_id
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = v_platform_user_id
        AND patient.integrator_user_id = occurrence.integrator_user_id
    )
    AND (
      v_patient_user_id IS NOT NULL
      OR (
        occurrence.integrator_user_id = v_integrator_user_id
        AND occurrence.organization_id = v_org_id
        AND rule.organization_id = v_org_id
      )
    )
  RETURNING occurrence.skipped_at, rule.id INTO skipped_at, v_rule_id;

  IF skipped_at IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, skip_reason)
  VALUES (v_org_id, v_rule_id, p_integrator_occurrence_id, 'skipped', p_reason)
  ON CONFLICT DO NOTHING;

  RETURN NEXT;
END
$function$;

-- Ready result for legacy “done” callback, including the existing local-day aggregate UX.
CREATE OR REPLACE FUNCTION app.patient_done_reminder_occurrence(p_integrator_occurrence_id text)
RETURNS TABLE (
  done_at timestamptz,
  first_done_for_occurrence boolean,
  day_done_count integer,
  day_sent_total integer,
  day_fully_done boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_rule_id uuid;
  v_occurred_at timestamptz;
  v_timezone text;
BEGIN
  IF v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;

  SELECT patient.id INTO v_platform_user_id
  FROM public.platform_users AS patient
  WHERE patient.integrator_user_id = v_integrator_user_id
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.platform_user_id = patient.id
        AND enrollment.organization_id = v_org_id
        AND enrollment.status = 'active'
    )
  LIMIT 1;
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  SELECT rule.id, occurrence.occurred_at
    INTO v_rule_id, v_occurred_at
  FROM public.reminder_occurrence_history AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.integrator_rule_id
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_user_id = v_integrator_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = v_platform_user_id
        AND patient.integrator_user_id = occurrence.integrator_user_id
    );
  IF v_rule_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_journal (organization_id, rule_id, occurrence_id, action)
  VALUES (v_org_id, v_rule_id, p_integrator_occurrence_id, 'done')
  ON CONFLICT DO NOTHING
  RETURNING created_at INTO done_at;
  first_done_for_occurrence := done_at IS NOT NULL;
  IF NOT first_done_for_occurrence THEN
    SELECT journal.created_at INTO done_at
    FROM public.reminder_journal AS journal
    WHERE journal.occurrence_id = p_integrator_occurrence_id AND journal.action = 'done'
    ORDER BY journal.created_at DESC
    LIMIT 1;
    IF done_at IS NULL THEN RETURN; END IF;
  END IF;

  SELECT setting.value_json ->> 'value' INTO v_timezone
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = 'app_display_timezone'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN
    RAISE EXCEPTION 'app_display_timezone_unavailable';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE occurrence.status = 'sent')::integer,
    COUNT(journal.id) FILTER (WHERE occurrence.status = 'sent')::integer
  INTO day_sent_total, day_done_count
  FROM public.reminder_occurrence_history AS occurrence
  LEFT JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.integrator_rule_id
   AND rule.organization_id = v_org_id
  LEFT JOIN public.reminder_journal AS journal
    ON journal.rule_id = rule.id
   AND journal.occurrence_id = occurrence.integrator_occurrence_id
   AND journal.action = 'done'
  WHERE occurrence.integrator_user_id = v_integrator_user_id
    AND occurrence.organization_id = v_org_id
    AND (occurrence.occurred_at AT TIME ZONE v_timezone)::date =
        (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0 AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$function$;

-- Global mute is still bound to the actor's exact active organization before the user row is changed.
CREATE OR REPLACE FUNCTION app.patient_set_reminder_muted_until(p_muted_until timestamptz)
RETURNS TABLE (muted_until timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
BEGIN
  IF v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
  SELECT patient.id INTO v_platform_user_id
  FROM public.platform_users AS patient
  WHERE patient.integrator_user_id = v_integrator_user_id
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.platform_user_id = patient.id
        AND enrollment.organization_id = v_org_id
        AND enrollment.status = 'active'
    )
  LIMIT 1;
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  UPDATE public.platform_users AS patient
  SET reminder_muted_until = p_muted_until
  WHERE patient.id = v_platform_user_id
  RETURNING patient.reminder_muted_until INTO muted_until;
  RETURN NEXT;
END
$function$;

-- “Do not remind in this bot”: mutate the canonical preference and return the existing ready copy.
CREATE OR REPLACE FUNCTION app.patient_disable_reminder_messenger_topic(
  p_integrator_occurrence_id text,
  p_messenger_channel text
)
RETURNS TABLE (persisted boolean, paragraphs jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_topic_code text;
  v_label text;
  v_active_labels text[] := ARRAY[]::text[];
  v_list_csv text;
BEGIN
  IF p_messenger_channel NOT IN ('telegram', 'max')
     OR v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
  v_label := CASE p_messenger_channel WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END;

  SELECT patient.id INTO v_platform_user_id
  FROM public.platform_users AS patient
  WHERE patient.integrator_user_id = v_integrator_user_id
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.platform_user_id = patient.id
        AND enrollment.organization_id = v_org_id
        AND enrollment.status = 'active'
    )
  LIMIT 1;
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(
      NULLIF(btrim(rule.notification_topic_code), ''),
      CASE
        WHEN rule.category = 'water' THEN NULL
        WHEN lower(COALESCE(rule.reminder_intent, '')) = 'warmup' THEN 'warmup_reminders'
        WHEN lower(COALESCE(rule.reminder_intent, '')) IN ('exercises', 'stretch', 'generic') THEN 'training_reminders'
        WHEN rule.linked_object_type IN ('rehab_program', 'treatment_program_item', 'lfk_complex', 'content_page', 'content_section') THEN 'training_reminders'
        WHEN btrim(occurrence.category) = 'warmup' THEN 'warmup_reminders'
        WHEN btrim(occurrence.category) IN ('exercise', 'breathing') THEN 'training_reminders'
        ELSE NULL
      END
    )
  INTO v_topic_code
  FROM public.reminder_occurrence_history AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.integrator_rule_id
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_user_id = v_integrator_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_topic_code IS NULL THEN
    persisted := false;
    paragraphs := jsonb_build_array(
      format('Хорошо — для этого типа напоминаний канал (%s) пока не настраивается через темы уведомлений.', v_label),
      'Откройте «Настроить каналы уведомлений» ниже, если хотите управлять напоминаниями в приложении.',
      'Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.'
    );
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.user_notification_topic_channels AS preference
    (user_id, topic_code, channel_code, is_enabled, updated_at)
  VALUES (v_platform_user_id, v_topic_code, p_messenger_channel, false, statement_timestamp())
  ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
    SET is_enabled = false, updated_at = EXCLUDED.updated_at;

  IF v_topic_code NOT IN ('warmup_reminders', 'training_reminders')
     AND EXISTS (
       SELECT 1 FROM public.user_web_push_subscriptions AS subscription
       WHERE subscription.user_id = v_platform_user_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_channel_preferences AS preference
       WHERE preference.platform_user_id = v_platform_user_id
         AND preference.channel_code = 'web_push'
         AND preference.is_enabled_for_notifications = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_notification_topic_channels AS preference
       WHERE preference.user_id = v_platform_user_id
         AND preference.topic_code = v_topic_code
         AND preference.channel_code = 'web_push'
         AND preference.is_enabled = false
     ) THEN
    v_active_labels := array_append(v_active_labels, 'Push');
  END IF;
  FOREACH v_label IN ARRAY ARRAY['telegram', 'max'] LOOP
    IF EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = v_platform_user_id AND binding.channel_code = v_label
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = v_platform_user_id
        AND preference.channel_code = v_label
        AND preference.is_enabled_for_notifications = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = v_platform_user_id
        AND preference.topic_code = v_topic_code
        AND preference.channel_code = v_label
        AND preference.is_enabled = false
    ) THEN
      v_active_labels := array_append(v_active_labels, CASE v_label WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END);
    END IF;
  END LOOP;
  IF v_topic_code NOT IN ('warmup_reminders', 'training_reminders')
     AND EXISTS (
       SELECT 1 FROM public.platform_users AS patient
       WHERE patient.id = v_platform_user_id
         AND NULLIF(btrim(patient.email), '') IS NOT NULL
         AND patient.email_verified_at IS NOT NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_channel_preferences AS preference
       WHERE preference.platform_user_id = v_platform_user_id
         AND preference.channel_code = 'email'
         AND preference.is_enabled_for_notifications = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_notification_topic_channels AS preference
       WHERE preference.user_id = v_platform_user_id
         AND preference.topic_code = v_topic_code
         AND preference.channel_code = 'email'
         AND preference.is_enabled = false
     ) THEN
    v_active_labels := array_append(v_active_labels, 'Email');
  END IF;

  v_list_csv := array_to_string(v_active_labels, ', ');
  IF array_length(v_active_labels, 1) = 2 THEN
    v_list_csv := v_active_labels[1] || ' и ' || v_active_labels[2];
  ELSIF array_length(v_active_labels, 1) > 2 THEN
    v_list_csv := array_to_string(v_active_labels[1:array_length(v_active_labels, 1) - 1], ', ')
      || ' и ' || v_active_labels[array_length(v_active_labels, 1)];
  END IF;
  persisted := true;
  paragraphs := jsonb_build_array(
    format('Хорошо, отключаю напоминания в боте (%s).', CASE p_messenger_channel WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END),
    CASE WHEN COALESCE(v_list_csv, '') <> ''
      THEN format('Сейчас остаются активными напоминания в %s.', v_list_csv)
      ELSE 'Сейчас не осталось активных каналов для напоминаний.' END,
    'Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.'
  );
  RETURN NEXT;
END
$function$;

-- One capability covers settings display (NULL topic) and idempotent atomic toggle (known topic).
CREATE OR REPLACE FUNCTION app.patient_reminder_notification_settings(
  p_messenger_channel text,
  p_toggle_topic_code text
)
RETURNS TABLE (topics jsonb, new_state boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
BEGIN
  IF p_messenger_channel NOT IN ('telegram', 'max')
     OR v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
  SELECT patient.id INTO v_platform_user_id
  FROM public.platform_users AS patient
  WHERE patient.integrator_user_id = v_integrator_user_id
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.platform_user_id = patient.id
        AND enrollment.organization_id = v_org_id
        AND enrollment.status = 'active'
    )
  LIMIT 1;
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  IF p_toggle_topic_code IS NOT NULL THEN
    IF p_toggle_topic_code NOT IN (
      'warmup_reminders', 'training_reminders', 'appointment_reminders', 'patient_news',
      'specialist_messages', 'support_messages', 'important_broadcasts'
    ) THEN RETURN; END IF;
    INSERT INTO public.user_notification_topic_channels AS preference
      (user_id, topic_code, channel_code, is_enabled, updated_at)
    VALUES (v_platform_user_id, p_toggle_topic_code, p_messenger_channel, false, statement_timestamp())
    ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
      SET is_enabled = NOT preference.is_enabled, updated_at = EXCLUDED.updated_at
    RETURNING is_enabled INTO new_state;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object('code', definition.code, 'title', definition.title,
      'isEnabled', COALESCE(preference.is_enabled, true))
    ORDER BY definition.position
  )
  INTO topics
  FROM (
    VALUES
      (1, 'warmup_reminders'::text, 'Напоминания о разминках'::text),
      (2, 'training_reminders', 'Напоминания о тренировках'),
      (3, 'appointment_reminders', 'Напоминания о записях'),
      (4, 'patient_news', 'Новости и уведомления'),
      (5, 'specialist_messages', 'Сообщения специалиста'),
      (6, 'support_messages', 'Сообщения поддержки'),
      (7, 'important_broadcasts', 'Важные рассылки')
  ) AS definition(position, code, title)
  LEFT JOIN public.user_notification_topic_channels AS preference
    ON preference.user_id = v_platform_user_id
   AND preference.topic_code = definition.code
   AND preference.channel_code = p_messenger_channel;
  RETURN NEXT;
END
$function$;

DO $d7_reminder_capability_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) OWNER TO app_owner;
    ALTER FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) OWNER TO app_owner;
    ALTER FUNCTION app.patient_done_reminder_occurrence(text) OWNER TO app_owner;
    ALTER FUNCTION app.patient_set_reminder_muted_until(timestamptz) OWNER TO app_owner;
    ALTER FUNCTION app.patient_disable_reminder_messenger_topic(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.patient_reminder_notification_settings(text, text) OWNER TO app_owner;
  END IF;
END
$d7_reminder_capability_owner$;

REVOKE ALL ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_done_reminder_occurrence(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_set_reminder_muted_until(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_disable_reminder_messenger_topic(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_reminder_notification_settings(text, text) FROM PUBLIC;

DO $d7_reminder_capability_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_done_reminder_occurrence(text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_set_reminder_muted_until(timestamptz) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_disable_reminder_messenger_topic(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_reminder_notification_settings(text, text) TO app_patient;
  END IF;
END
$d7_reminder_capability_grants$;

COMMENT ON FUNCTION app.patient_done_reminder_occurrence(text) IS
  'D7: principal-derived, exact-organization reminder done capability with ready callback aggregate.';
COMMENT ON FUNCTION app.patient_set_reminder_muted_until(timestamptz) IS
  'D7: principal-derived, exact-organization global reminder mute capability.';
COMMENT ON FUNCTION app.patient_disable_reminder_messenger_topic(text, text) IS
  'D7: principal-derived topic disable capability with ready callback paragraphs.';
COMMENT ON FUNCTION app.patient_reminder_notification_settings(text, text) IS
  'D7: principal-derived reminder notification settings display/toggle capability.';
