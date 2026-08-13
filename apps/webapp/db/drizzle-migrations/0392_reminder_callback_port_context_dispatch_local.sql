-- 0392: the reminder callback capabilities are shared by the patient UI and the integrator
-- callback port. After the transaction-bound cutover, the strict identity accessors deliberately
-- reject the other context class. Dispatch before reading either identity so a patient transaction
-- never probes the integrator accessor (and vice versa).

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
  v_rule_id text;
  v_snoozed_until timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]
  );
  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF p_minutes NOT BETWEEN 1 AND 720 OR v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL THEN
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
  ELSE RETURN;
  END IF;

  SELECT operational.rule_id, rule.id
  INTO v_rule_id, v_rule_uuid
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_id IS NULL THEN RETURN; END IF;

  SELECT journal.snooze_until INTO v_snoozed_until
  FROM public.reminder_journal AS journal
  WHERE journal.occurrence_id = p_integrator_occurrence_id
    AND journal.action = 'snoozed'
  LIMIT 1;
  IF v_snoozed_until IS NOT NULL THEN
    snoozed_until := v_snoozed_until;
    RETURN NEXT;
    RETURN;
  END IF;

  v_snoozed_until := statement_timestamp() + make_interval(mins => p_minutes);
  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent',
         COALESCE(operational.sent_at, operational.planned_at)
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  UPDATE public.reminder_occurrence_history
  SET snoozed_at = statement_timestamp(), snoozed_until = v_snoozed_until
  WHERE integrator_occurrence_id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND skipped_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, snooze_until)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'snoozed', v_snoozed_until);

  UPDATE integrator.user_reminder_occurrences
  SET planned_at = v_snoozed_until,
      delivery_generation = delivery_generation + 1,
      status = 'planned', queued_at = NULL, sent_at = NULL, failed_at = NULL,
      delivery_channel = NULL, delivery_job_id = NULL, error_code = NULL,
      updated_at = statement_timestamp()
  WHERE id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  snoozed_until := v_snoozed_until;
  RETURN NEXT;
END
$function$;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]
  );
  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT rule.id INTO v_rule_uuid
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_uuid IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent',
         COALESCE(operational.sent_at, operational.planned_at)
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  UPDATE public.reminder_occurrence_history AS history
  SET skipped_at = COALESCE(history.skipped_at, statement_timestamp()), skip_reason = NULL
  WHERE history.integrator_occurrence_id = p_integrator_occurrence_id
    AND history.platform_user_id = v_platform_user_id
  RETURNING history.skipped_at INTO skipped_at;
  IF skipped_at IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, skip_reason)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'skipped', NULL)
  ON CONFLICT DO NOTHING;

  UPDATE integrator.user_reminder_occurrences
  SET status = 'skipped', updated_at = statement_timestamp()
  WHERE id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  RETURN NEXT;
END
$function$;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
  v_occurred_at timestamptz;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]
  );
  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    v_platform_user_id := v_patient_user_id;
  ELSIF v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT rule.id, COALESCE(operational.sent_at, operational.planned_at)
  INTO v_rule_uuid, v_occurred_at
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_uuid IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent', v_occurred_at
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  INSERT INTO public.reminder_journal (organization_id, rule_id, occurrence_id, action)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'done')
  ON CONFLICT DO NOTHING
  RETURNING created_at INTO done_at;
  first_done_for_occurrence := done_at IS NOT NULL;
  IF NOT first_done_for_occurrence THEN
    SELECT journal.created_at INTO done_at
    FROM public.reminder_journal AS journal
    WHERE journal.occurrence_id = p_integrator_occurrence_id AND journal.action = 'done'
    LIMIT 1;
    IF done_at IS NULL THEN RETURN; END IF;
  END IF;

  SELECT setting.value_json ->> 'value' INTO v_timezone
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = 'app_display_timezone' AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE history.status = 'sent')::integer,
    COUNT(journal.id) FILTER (WHERE history.status = 'sent')::integer
  INTO day_sent_total, day_done_count
  FROM public.reminder_occurrence_history AS history
  LEFT JOIN public.reminder_journal AS journal
    ON journal.occurrence_id = history.integrator_occurrence_id AND journal.action = 'done'
  WHERE history.platform_user_id = v_platform_user_id
    AND history.organization_id = v_org_id
    AND (history.occurred_at AT TIME ZONE v_timezone)::date =
        (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0
    AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$function$;
