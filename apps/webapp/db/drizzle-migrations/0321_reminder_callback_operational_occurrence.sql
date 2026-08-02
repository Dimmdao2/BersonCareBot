-- 0321: D7/D21 keep the canonical snooze and the operational due occurrence in one capability.
--
-- 0314 is already deployed. This forward-only replacement preserves its principal and exact-org
-- checks, but makes a successful snooze move the same integrator occurrence atomically. The
-- integrator runtime receives only EXECUTE on this app.* door, never table UPDATE privileges.

DO $d7_operational_occurrence_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, UPDATE ON TABLE integrator.user_reminder_occurrences TO app_owner;
  END IF;
END
$d7_operational_occurrence_owner_grants$;

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
  v_operational_occurrence_id text;
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
        SELECT 1
        FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id
          AND enrollment.status = 'active'
      )
    LIMIT 1;
    IF v_platform_user_id IS NULL THEN RETURN; END IF;
  ELSE
    RETURN;
  END IF;

  -- A duplicate signed callback returns the original canonical decision and leaves a later
  -- delivery lifecycle untouched; it must neither add history nor calculate a new deadline.
  SELECT journal.snooze_until INTO snoozed_until
  FROM public.reminder_journal AS journal
  INNER JOIN public.reminder_occurrence_history AS occurrence
    ON occurrence.integrator_occurrence_id = journal.occurrence_id
  INNER JOIN public.reminder_rules AS rule
    ON rule.id = journal.rule_id
   AND rule.integrator_rule_id = occurrence.integrator_rule_id
  INNER JOIN integrator.user_reminder_occurrences AS operational
    ON operational.id = occurrence.integrator_occurrence_id
   AND operational.rule_id = rule.integrator_rule_id
  WHERE journal.occurrence_id = p_integrator_occurrence_id
    AND journal.action = 'snoozed'
    AND occurrence.integrator_user_id = v_integrator_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id
    AND COALESCE(operational.organization_id, rule.organization_id) = v_org_id
    AND EXISTS (
      SELECT 1
      FROM public.platform_users AS patient
      WHERE patient.id = v_platform_user_id
        AND patient.integrator_user_id = occurrence.integrator_user_id
    );
  IF snoozed_until IS NOT NULL THEN RETURN NEXT; RETURN; END IF;

  UPDATE public.reminder_occurrence_history AS occurrence
  SET snoozed_at = statement_timestamp(),
      snoozed_until = statement_timestamp() + make_interval(mins => p_minutes)
  FROM public.reminder_rules AS rule,
       integrator.user_reminder_occurrences AS operational
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_rule_id = rule.integrator_rule_id
    AND operational.id = occurrence.integrator_occurrence_id
    AND operational.rule_id = rule.integrator_rule_id
    AND occurrence.skipped_at IS NULL
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id
    AND COALESCE(operational.organization_id, rule.organization_id) = v_org_id
    AND EXISTS (
      SELECT 1
      FROM public.platform_users AS patient
      WHERE patient.id = v_platform_user_id
        AND patient.integrator_user_id = occurrence.integrator_user_id
    )
    AND (
      v_patient_user_id IS NOT NULL
      OR occurrence.integrator_user_id = v_integrator_user_id
    )
  RETURNING occurrence.snoozed_until, rule.id INTO snoozed_until, v_rule_id;
  IF snoozed_until IS NULL THEN RETURN; END IF;

  UPDATE integrator.user_reminder_occurrences AS operational
  SET planned_at = snoozed_until,
      status = 'planned',
      queued_at = NULL,
      sent_at = NULL,
      failed_at = NULL,
      delivery_channel = NULL,
      delivery_job_id = NULL,
      error_code = NULL,
      updated_at = statement_timestamp()
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.rule_id = (
      SELECT rule.integrator_rule_id FROM public.reminder_rules AS rule WHERE rule.id = v_rule_id
    )
    AND COALESCE(operational.organization_id, v_org_id) = v_org_id
  RETURNING operational.id INTO v_operational_occurrence_id;
  IF v_operational_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'reminder_operational_occurrence_missing';
  END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, snooze_until)
  VALUES (v_org_id, v_rule_id, p_integrator_occurrence_id, 'snoozed', snoozed_until)
  ON CONFLICT DO NOTHING;

  RETURN NEXT;
END
$function$;

DO $d7_operational_occurrence_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) OWNER TO app_owner;
  END IF;
END
$d7_operational_occurrence_owner$;

REVOKE ALL ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) FROM PUBLIC;

DO $d7_operational_occurrence_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) TO app_patient;
  END IF;
END
$d7_operational_occurrence_grants$;

COMMENT ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) IS
  'D7/D21: principal-derived canonical snooze; atomically reschedules the exact operational occurrence.';
