-- TEMPORARY LOCAL MIGRATION NUMBER 0323
-- RECONCILES-MIGRATION-HASH: 0312_reminder_rules_scheduler_canonical_local
-- Forward-only replay of the accepted D5 scheduler canonical-rule cutover.
-- public.reminder_rules becomes the only business-rule parent for integrator occurrence mechanics.
-- Never delete occurrence/delivery history: rule_id keeps its stable integrator_rule_id value.
-- The legacy table is intentionally retained: current one-shot backfill/reconcile tooling still
-- names it, so it is not a zero-consumer drop candidate. It is no longer a runtime rule source.

LOCK TABLE integrator.user_reminder_rules, integrator.user_reminder_occurrences,
  integrator.user_reminder_delivery_logs, public.reminder_rules IN SHARE ROW EXCLUSIVE MODE;

DO $d5_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM integrator.user_reminder_rules legacy
    WHERE legacy.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'D5 precondition failed: integrator.user_reminder_rules contains a rule without organization_id'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM integrator.user_reminder_rules legacy
    JOIN public.platform_users platform_user
      ON platform_user.integrator_user_id = legacy.user_id
    GROUP BY legacy.id
    HAVING count(platform_user.id) > 1
  ) THEN
    RAISE EXCEPTION
      'D5 precondition failed: a legacy reminder rule maps to multiple platform users'
      USING ERRCODE = '23514';
  END IF;
END
$d5_preflight$;

-- Old rows predate D5 direct writes. Their stable text ID and scheduler fields are copied only when
-- the canonical row is absent. Existing canonical rows are newer product authority and must not be
-- forced back to stale legacy topic/intent/schedule values by this late forward replay.
INSERT INTO public.reminder_rules (
  integrator_rule_id, platform_user_id, organization_id, integrator_user_id,
  category, is_enabled, schedule_type, timezone, interval_minutes,
  window_start_minute, window_end_minute, days_mask, content_mode,
  linked_object_type, linked_object_id, custom_title, custom_text,
  schedule_data, reminder_intent, quiet_hours_start_minute, quiet_hours_end_minute,
  notification_topic_code, created_at, updated_at
)
SELECT
  legacy.id,
  (
    SELECT platform_user.id
    FROM public.platform_users platform_user
    WHERE platform_user.integrator_user_id = legacy.user_id
    LIMIT 1
  ),
  legacy.organization_id,
  legacy.user_id,
  legacy.category, legacy.is_enabled, legacy.schedule_type, legacy.timezone,
  legacy.interval_minutes, legacy.window_start_minute, legacy.window_end_minute,
  legacy.days_mask, legacy.content_mode,
  legacy.linked_object_type, legacy.linked_object_id, legacy.custom_title, legacy.custom_text,
  legacy.schedule_data, legacy.reminder_intent, legacy.quiet_hours_start_minute,
  legacy.quiet_hours_end_minute, legacy.notification_topic_code,
  legacy.created_at, legacy.updated_at
FROM integrator.user_reminder_rules legacy
LEFT JOIN public.reminder_rules canonical
  ON canonical.integrator_rule_id = legacy.id
WHERE canonical.integrator_rule_id IS NULL;

-- The earlier projection could leave organization_id NULL. Filling that one missing ownership value
-- from an exactly matching legacy row is safe; every other disagreement remains a hard stop below.
UPDATE public.reminder_rules canonical
SET organization_id = legacy.organization_id
FROM integrator.user_reminder_rules legacy
WHERE canonical.integrator_rule_id = legacy.id
  AND canonical.organization_id IS NULL
  AND canonical.integrator_user_id = legacy.user_id
  AND legacy.organization_id IS NOT NULL;

DO $d5_identity_parity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM integrator.user_reminder_rules legacy
    LEFT JOIN public.reminder_rules canonical
      ON canonical.integrator_rule_id = legacy.id
    WHERE canonical.integrator_rule_id IS NULL
       OR canonical.organization_id IS DISTINCT FROM legacy.organization_id
  ) THEN
    RAISE EXCEPTION
      'D5 precondition failed: canonical reminder_rules ownership differs from legacy data; resolve mapping before retrying'
      USING ERRCODE = '23514';
  END IF;
END
$d5_identity_parity$;

ALTER TABLE integrator.user_reminder_occurrences
  DROP CONSTRAINT IF EXISTS user_reminder_occurrences_rule_id_fkey;
ALTER TABLE integrator.user_reminder_occurrences
  ADD CONSTRAINT user_reminder_occurrences_rule_id_fkey
  FOREIGN KEY (rule_id)
  REFERENCES public.reminder_rules(integrator_rule_id)
  ON DELETE RESTRICT;

-- The current runtime policy artifact is generated from the same public-rule chain. Replace the
-- live parent reference before dropping the legacy table; both forms stay fail-closed by owner.
DROP POLICY IF EXISTS saas_org_dormant_p0_8_5 ON integrator.user_reminder_delivery_logs;
CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_reminder_delivery_logs FOR ALL
  USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM integrator.user_reminder_occurrences occurrence JOIN public.reminder_rules rule ON rule.integrator_rule_id = occurrence.rule_id WHERE occurrence.id = occurrence_id AND rule.integrator_user_id = app.current_integrator_user_id())))))
  WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM integrator.user_reminder_occurrences occurrence JOIN public.reminder_rules rule ON rule.integrator_rule_id = occurrence.rule_id WHERE occurrence.id = occurrence_id AND rule.integrator_user_id = app.current_integrator_user_id())))));

DROP POLICY IF EXISTS saas_org_dormant_p0_8_5 ON integrator.user_reminder_occurrences;
CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_reminder_occurrences FOR ALL
  USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.reminder_rules rule WHERE rule.integrator_rule_id = rule_id AND rule.integrator_user_id = app.current_integrator_user_id())))))
  WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.reminder_rules rule WHERE rule.integrator_rule_id = rule_id AND rule.integrator_user_id = app.current_integrator_user_id())))));

CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)
RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_payload jsonb;
  v_occurrence_id text;
  v_broadcast_audit_id uuid;
  v_incident_id uuid;
  occurrence_org uuid;
  rule_org uuid;
BEGIN
  SELECT queue.kind, queue.payload_json INTO queue_kind, queue_payload
  FROM public.outgoing_delivery_queue AS queue WHERE queue.id = p_queue_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 'queue_not_found'::text;
    RETURN;
  END IF;
  IF queue_kind = 'operator_alert' THEN
    IF COALESCE(queue_payload ->> 'incidentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_incident_id'::text;
      RETURN;
    END IF;
    v_incident_id := (queue_payload ->> 'incidentId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.operator_incidents AS incident WHERE incident.id = v_incident_id) THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'incident_not_found'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;
  IF queue_kind = 'inbound_reply' THEN
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;
  IF queue_kind = 'reminder_dispatch' THEN
    IF COALESCE(queue_payload ->> 'occurrenceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_occurrence_id'::text;
      RETURN;
    END IF;
    v_occurrence_id := queue_payload ->> 'occurrenceId';
    SELECT occurrence.organization_id, rule.organization_id INTO occurrence_org, rule_org
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.id = v_occurrence_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'occurrence_not_found'::text;
    ELSIF occurrence_org IS NOT NULL AND rule_org IS NOT NULL AND occurrence_org <> rule_org THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'ambiguous_organization'::text;
    ELSIF COALESCE(occurrence_org, rule_org) IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, COALESCE(occurrence_org, rule_org), 'tenant'::text;
    END IF;
    RETURN;
  END IF;
  IF queue_kind = 'doctor_broadcast_intent' THEN
    IF COALESCE(queue_payload ->> 'broadcastAuditId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_broadcast_audit_id'::text;
      RETURN;
    END IF;
    v_broadcast_audit_id := (queue_payload ->> 'broadcastAuditId')::uuid;
    SELECT audit.organization_id INTO organization_id
    FROM public.broadcast_audit AS audit WHERE audit.id = v_broadcast_audit_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'broadcast_audit_not_found'::text;
    ELSIF organization_id IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, organization_id, 'tenant'::text;
    END IF;
    RETURN;
  END IF;
  RETURN QUERY SELECT queue_kind, NULL::uuid, 'unsupported_queue_kind'::text;
END
$function$;

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

DO $d5_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    EXECUTE 'GRANT SELECT ON public.reminder_rules TO app_owner';
  END IF;
END
$d5_grant$;
