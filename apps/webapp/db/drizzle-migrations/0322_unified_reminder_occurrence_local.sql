-- TEMPORARY LOCAL MIGRATION NUMBER 0322 — Track D / #987 D21.
--
-- `integrator.user_reminder_occurrences` is the operational occurrence for every
-- canonical `public.reminder_rules` row, including a rule whose user has no bot
-- identity.  The legacy web-push table is retained until its runtime consumers
-- are removed in the same rollout; only still actionable rows are copied here.

ALTER TABLE integrator.user_reminder_occurrences
  ADD COLUMN IF NOT EXISTS platform_user_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_generation integer NOT NULL DEFAULT 0;

UPDATE integrator.user_reminder_occurrences AS occurrence
SET platform_user_id = COALESCE(
  rule.platform_user_id,
  platform_user.id
)
FROM public.reminder_rules AS rule
LEFT JOIN public.platform_users AS platform_user
  ON platform_user.integrator_user_id = rule.integrator_user_id
WHERE occurrence.rule_id = rule.integrator_rule_id
  AND occurrence.platform_user_id IS NULL;

DO $d21_platform_user_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM integrator.user_reminder_occurrences AS occurrence
    WHERE occurrence.platform_user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'D21 precondition failed: operational reminder occurrence has no platform_user_id'
      USING ERRCODE = '23514';
  END IF;
END
$d21_platform_user_preflight$;

ALTER TABLE integrator.user_reminder_occurrences
  ALTER COLUMN platform_user_id SET NOT NULL;

ALTER TABLE integrator.user_reminder_occurrences
  DROP CONSTRAINT IF EXISTS user_reminder_occurrences_platform_user_id_fkey;
ALTER TABLE integrator.user_reminder_occurrences
  ADD CONSTRAINT user_reminder_occurrences_platform_user_id_fkey
  FOREIGN KEY (platform_user_id)
  REFERENCES public.platform_users(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS user_reminder_occurrences_platform_due_idx
  ON integrator.user_reminder_occurrences (platform_user_id, status, planned_at);
CREATE INDEX IF NOT EXISTS user_reminder_occurrences_generation_idx
  ON integrator.user_reminder_occurrences (id, delivery_generation);

-- A web-push-only occurrence is actionable only while it is still pending and
-- within the existing three-minute scheduler grace.  Older rows were already
-- terminal under the legacy tick and must not be resurrected as deliveries.
INSERT INTO integrator.user_reminder_occurrences (
  id,
  rule_id,
  occurrence_key,
  planned_at,
  status,
  sent_at,
  failed_at,
  error_code,
  organization_id,
  platform_user_id,
  delivery_generation,
  created_at,
  updated_at
)
SELECT
  legacy.id::text,
  legacy.integrator_rule_id,
  legacy.occurrence_key,
  legacy.planned_at,
  legacy.status,
  legacy.sent_at,
  legacy.failed_at,
  legacy.error_code,
  legacy.organization_id,
  legacy.platform_user_id,
  0,
  legacy.created_at,
  legacy.updated_at
FROM public.webapp_reminder_occurrences AS legacy
INNER JOIN public.reminder_rules AS rule
  ON rule.integrator_rule_id = legacy.integrator_rule_id
WHERE legacy.status IN ('planned', 'queued')
  AND legacy.planned_at >= statement_timestamp() - interval '3 minutes'
  AND rule.platform_user_id = legacy.platform_user_id
  AND rule.organization_id = legacy.organization_id
ON CONFLICT DO NOTHING;

DO $d21_pending_webpush_parity$
DECLARE
  legacy_pending integer;
  unified_pending integer;
BEGIN
  SELECT count(*) INTO legacy_pending
  FROM public.webapp_reminder_occurrences AS legacy
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = legacy.integrator_rule_id
  WHERE legacy.status IN ('planned', 'queued')
    AND legacy.planned_at >= statement_timestamp() - interval '3 minutes'
    AND rule.platform_user_id = legacy.platform_user_id
    AND rule.organization_id = legacy.organization_id;

  SELECT count(*) INTO unified_pending
  FROM integrator.user_reminder_occurrences AS occurrence
  INNER JOIN public.webapp_reminder_occurrences AS legacy
    ON occurrence.occurrence_key = legacy.occurrence_key
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = legacy.integrator_rule_id
  WHERE legacy.status IN ('planned', 'queued')
    AND legacy.planned_at >= statement_timestamp() - interval '3 minutes'
    AND rule.platform_user_id = legacy.platform_user_id
    AND rule.organization_id = legacy.organization_id
    AND occurrence.platform_user_id = legacy.platform_user_id
    AND occurrence.delivery_generation = 0;

  IF legacy_pending <> unified_pending THEN
    RAISE EXCEPTION
      'D21 pending web-push migration parity failed: legacy %, unified %',
      legacy_pending, unified_pending
      USING ERRCODE = '23514';
  END IF;
END
$d21_pending_webpush_parity$;

COMMENT ON COLUMN integrator.user_reminder_occurrences.platform_user_id IS
  'D21 canonical platform identity; required even without an integrator bot user.';
COMMENT ON COLUMN integrator.user_reminder_occurrences.delivery_generation IS
  'D21 monotonic delivery generation; a snooze advances it exactly once.';

ALTER TABLE public.reminder_occurrence_history
  ADD COLUMN IF NOT EXISTS platform_user_id uuid;

UPDATE public.reminder_occurrence_history AS history
SET platform_user_id = rule.platform_user_id
FROM public.reminder_rules AS rule
WHERE history.platform_user_id IS NULL
  AND history.integrator_rule_id = rule.integrator_rule_id
  AND rule.platform_user_id IS NOT NULL;

UPDATE public.reminder_occurrence_history AS history
SET platform_user_id = patient.id
FROM public.platform_users AS patient
WHERE history.platform_user_id IS NULL
  AND patient.integrator_user_id = history.integrator_user_id;

ALTER TABLE public.reminder_occurrence_history
  ALTER COLUMN integrator_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_platform_user_id
  ON public.reminder_occurrence_history (platform_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION app.list_scheduler_reminder_organization_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.platform_user_id IS NOT NULL
      AND rule.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'scheduler reminder work contains rows without organization ownership'
      USING ERRCODE = '23514';
  END IF;
  RETURN QUERY
  SELECT candidate.organization_id
  FROM (
    SELECT rule.organization_id
    FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.platform_user_id IS NOT NULL
      AND rule.organization_id IS NOT NULL
    UNION
    SELECT COALESCE(occurrence.organization_id, rule.organization_id)
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND COALESCE(occurrence.organization_id, rule.organization_id) IS NOT NULL
  ) AS candidate
  ORDER BY candidate.organization_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.patient_cancel_pending_reminder_occurrences(p_rule_id text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_org_id uuid := app.current_org_id();
  v_deleted integer := 0;
BEGIN
  IF v_patient_user_id IS NULL OR v_org_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM integrator.user_reminder_occurrences AS occurrence
  USING public.reminder_rules AS rule
  WHERE occurrence.rule_id = p_rule_id
    AND occurrence.rule_id = rule.integrator_rule_id
    AND occurrence.platform_user_id = v_patient_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.platform_user_id = v_patient_user_id
    AND rule.organization_id = v_org_id
    AND occurrence.status IN ('planned', 'queued');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$function$;

REVOKE ALL ON FUNCTION app.patient_cancel_pending_reminder_occurrences(text) FROM PUBLIC;
DO $d21_cancel_pending_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.patient_cancel_pending_reminder_occurrences(text) OWNER TO app_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.patient_cancel_pending_reminder_occurrences(text) TO app_patient;
  END IF;
END
$d21_cancel_pending_grant$;

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
  v_rule_uuid uuid;
  v_rule_id text;
  v_snoozed_until timestamptz;
BEGIN
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
  v_rule_uuid uuid;
BEGIN
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

  UPDATE public.reminder_occurrence_history
  SET skipped_at = COALESCE(skipped_at, statement_timestamp()), skip_reason = NULL
  WHERE integrator_occurrence_id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
  RETURNING public.reminder_occurrence_history.skipped_at INTO skipped_at;
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
  v_patient_user_id uuid := app.current_patient_user_id();
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_rule_uuid uuid;
  v_occurred_at timestamptz;
  v_timezone text;
BEGIN
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

CREATE OR REPLACE FUNCTION app.patient_set_reminder_mute(
  p_minutes integer,
  p_until_tomorrow boolean
)
RETURNS TABLE (muted_until timestamptz)
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
  v_timezone text;
BEGIN
  IF v_org_id IS NULL OR (p_until_tomorrow = (p_minutes IS NOT NULL)) THEN RETURN; END IF;
  IF NOT p_until_tomorrow AND p_minutes NOT BETWEEN 1 AND 1440 THEN RETURN; END IF;
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
  IF v_platform_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.platform_user_id = v_platform_user_id
      AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  IF p_until_tomorrow THEN
    SELECT setting.value_json ->> 'value' INTO v_timezone
    FROM public.app_runtime_settings AS setting
    WHERE setting.key = 'app_display_timezone'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
    LIMIT 1;
    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
    ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;
    muted_until := (
      date_trunc('day', statement_timestamp() AT TIME ZONE v_timezone) + interval '1 day'
    ) AT TIME ZONE v_timezone;
  ELSE
    muted_until := statement_timestamp() + make_interval(mins => p_minutes);
  END IF;

  UPDATE public.platform_users
  SET reminder_muted_until = muted_until
  WHERE id = v_platform_user_id;
  RETURN NEXT;
END
$function$;

REVOKE ALL ON FUNCTION app.patient_set_reminder_mute(integer, boolean) FROM PUBLIC;
DO $d21_mute_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.patient_set_reminder_mute(integer, boolean) OWNER TO app_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.patient_set_reminder_mute(integer, boolean) TO app_patient;
  END IF;
END
$d21_mute_grants$;

-- The legacy table has no runtime consumer after this migration; parity above is the cutover gate.
DROP TABLE public.webapp_reminder_occurrences;
