-- TEMPORARY LOCAL MIGRATION NUMBER 0359 — final number assigned at land, per AGENTS.md §1.
-- D27-C: auth email OTP delivery moves off the public request into `outgoing_delivery_queue`
-- (the existing durable queue — no second queue). A login code must not queue behind ordinary
-- mailings, so the claim order gets an explicit priority column instead of relying on
-- next_retry_at tie-break order, which is unspecified once two rows share the same timestamp.
ALTER TABLE public.outgoing_delivery_queue
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;

-- Supersedes idx_outgoing_delivery_queue_due: claimDueOutgoingDeliveries now orders by
-- priority DESC before next_retry_at, so the due-set index must carry priority as a key column
-- (Postgres cannot satisfy an ORDER BY priority DESC, next_retry_at ASC from an index that only
-- has next_retry_at). This table is retention-managed (deleteExpiredSentOutgoingDeliveries runs
-- on every enqueue), so a plain CREATE INDEX matches every prior migration touching this table;
-- if it has grown large by apply time, reuse the online-index deploy pattern already established
-- for idx_outgoing_delivery_queue_organization_status_due (deploy/postgres/d30-outgoing-delivery-
-- queue-organization-status-due-online-index.sql) instead of applying this inline.
DROP INDEX IF EXISTS idx_outgoing_delivery_queue_due;
CREATE INDEX IF NOT EXISTS idx_outgoing_delivery_queue_due
  ON public.outgoing_delivery_queue (status, priority DESC, next_retry_at ASC);

-- auth_email_otp rows carry no organization_id (platform-level login, like inbound_reply and
-- operator_health_digest before it) — teach the scope resolver to treat it as operator_global
-- instead of falling through to 'unsupported_queue_kind'.
CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)
RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_payload jsonb;
  stored_organization_id uuid;
  v_occurrence_id text;
  v_broadcast_audit_id uuid;
  v_incident_id uuid;
  occurrence_org uuid;
  rule_org uuid;
BEGIN
  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO queue_kind, stored_organization_id, queue_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.id = p_queue_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 'queue_not_found'::text;
    RETURN;
  END IF;

  IF stored_organization_id IS NOT NULL THEN
    RETURN QUERY SELECT queue_kind, stored_organization_id, 'tenant'::text;
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

  IF queue_kind IN ('inbound_reply', 'operator_health_digest', 'auth_email_otp') THEN
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

ALTER FUNCTION app.resolve_outgoing_delivery_scope(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) FROM app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) TO app_operational_delivery_worker;
