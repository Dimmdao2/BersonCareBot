-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('app.record_operator_delivery_attempt(text,text,text,integer,text)') IS NULL
--
-- D10a / Р-D10a-2: the canonical delivery journal is also the journal for sends that do not
-- originate in outgoing_delivery_queue. Operator alerts cannot depend on the delivery queue whose
-- failure they report, and synchronous booking-confirmation mail keeps its delivery path unchanged.
--
-- This remains one root. The full delivery-attempt context is optional while a queue row exists;
-- in that branch the original validation, enrichment and insert are preserved. Without a matching
-- queue row, the same root uses the caller-supplied organization and sanitized audit context.
-- ACL/RLS remain exclusively in deploy/postgres/privileges reconciliation.

CREATE OR REPLACE FUNCTION app.record_operator_delivery_attempt(
  p_intent_type text,
  p_intent_event_id text,
  p_correlation_id text,
  p_organization_id uuid,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text,
  p_payload_text text,
  p_occurred_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_queue_kind text;
  v_organization_id uuid;
  v_payload jsonb;
  v_occurrence_id uuid;
  v_topic_code text;
  v_integrator_user_id text;
  v_user_id uuid;
  v_context_payload jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  IF length(COALESCE(p_intent_event_id, '')) NOT BETWEEN 1 AND 240
    OR p_channel NOT IN ('telegram', 'max', 'email', 'sms', 'smsc', 'web_push')
    OR p_status NOT IN ('success', 'failed', 'skipped')
    OR p_attempt NOT BETWEEN 1 AND 100
    OR length(COALESCE(p_reason, '')) > 500
    OR (p_status = 'success' AND p_reason IS NOT NULL AND p_reason <> 'dev_redirect_suppressed')
    OR (p_status = 'failed' AND p_reason IS DISTINCT FROM 'provider_rejected')
    OR (p_status = 'skipped' AND COALESCE(p_reason, '') = '')
  THEN
    RAISE EXCEPTION 'invalid operator delivery attempt audit input' USING ERRCODE = '23514';
  END IF;

  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO v_queue_kind, v_organization_id, v_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.channel = p_channel
    AND queue.payload_json #>> '{intent,meta,eventId}' = p_intent_event_id
  LIMIT 1;

  IF v_queue_kind IS NULL THEN
    v_context_payload := p_payload_text::jsonb;
    IF NULLIF(btrim(p_intent_type), '') IS NULL
      OR length(p_intent_type) > 200
      OR length(COALESCE(p_correlation_id, '')) > 500
      OR v_context_payload IS NULL
      OR jsonb_typeof(v_context_payload) <> 'object'
      OR pg_column_size(v_context_payload) > 65536
      OR p_occurred_at IS NULL
    THEN
      RAISE EXCEPTION 'invalid nonqueue operator delivery attempt audit context'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.notification_delivery_attempts (
      created_at,
      organization_id,
      intent_type,
      channel,
      status,
      reason,
      event_id,
      metadata
    ) VALUES (
      p_occurred_at,
      p_organization_id,
      p_intent_type,
      p_channel,
      p_status,
      p_reason,
      p_intent_event_id,
      jsonb_build_object(
        'attempt', p_attempt,
        'kind', p_intent_type,
        'channel', p_channel,
        'source', 'record_operator_delivery_attempt',
        'queueSource', false,
        'correlationId', NULLIF(p_correlation_id, ''),
        'payload', v_context_payload
      )
    );
    RETURN;
  END IF;

  v_occurrence_id := NULLIF(v_payload->>'occurrenceId', '')::uuid;
  v_topic_code := NULLIF(v_payload->>'topicCode', '');
  v_integrator_user_id := NULLIF(v_payload #>> '{intent,meta,userId}', '');
  IF NULLIF(v_payload->>'platformUserId', '') ~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_user_id := NULLIF(v_payload->>'platformUserId', '')::uuid;
  END IF;

  INSERT INTO public.notification_delivery_attempts (
    organization_id,
    user_id,
    integrator_user_id,
    topic_code,
    intent_type,
    channel,
    status,
    reason,
    event_id,
    occurrence_id,
    metadata
  ) VALUES (
    v_organization_id,
    v_user_id,
    v_integrator_user_id,
    v_topic_code,
    v_queue_kind,
    p_channel,
    p_status,
    p_reason,
    p_intent_event_id,
    v_occurrence_id,
    jsonb_build_object(
      'attempt', p_attempt,
      'kind', v_queue_kind,
      'channel', p_channel,
      'source', 'record_operator_delivery_attempt'
    )
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- A changed PostgreSQL argument list creates an overload; remove the obsolete parallel door.
DROP FUNCTION IF EXISTS app.record_operator_delivery_attempt(text, text, text, integer, text);
