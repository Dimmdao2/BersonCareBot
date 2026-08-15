-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0427
-- 0427: reconcile the outgoing-delivery worker audit root with the canonical D10a journal.
--
-- The former operator-alert-only body accepted only op-inc:* Telegram/MAX attempts and wrote to
-- integrator.delivery_attempt_logs. The worker routes every delivery.attempt.log through this root,
-- including auth e-mail OTP, reminders, broadcasts and inbound replies. Validate provenance against
-- the matching queue row and persist every supported outcome in notification_delivery_attempts.

CREATE OR REPLACE FUNCTION app.record_operator_delivery_attempt(
  p_intent_event_id text,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
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
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_telemetry_operator_owner'::name,
    ARRAY['app_operational_delivery_worker'::name]::name[]
  );

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
    RAISE EXCEPTION 'operator delivery attempt has no exact queue source' USING ERRCODE = '23514';
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

COMMENT ON FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) IS
  'Exact delivery-worker audit root for every outgoing queue kind; validates queue provenance and writes the canonical notification attempt journal.';

REVOKE ALL ON FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) FROM PUBLIC;
