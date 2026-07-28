-- 0269: durable audit capability for global integrator e-mail delivery attempts.
--
-- Locked integrator infra principals deliberately stay on the NOINHERIT API base login instead of
-- SET ROLE app_staff/app_patient. That login must not receive direct INSERT/sequence privileges on
-- integrator.delivery_attempt_logs, so the post-send audit uses this narrow app_owner-owned
-- SECURITY DEFINER capability. The TEST/PROD runtime role itself is environment-specific; its exact
-- EXECUTE grant is installed by deploy/postgres/integrator-server-runtime-config.sql.

CREATE OR REPLACE FUNCTION app.record_global_email_delivery_attempt(
  p_intent_type text,
  p_intent_event_id text,
  p_correlation_id text,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text,
  p_payload_json jsonb,
  p_occurred_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_intent_type IS DISTINCT FROM 'message.send'
    OR NULLIF(btrim(p_intent_event_id), '') IS NULL
    OR p_channel IS DISTINCT FROM 'email'
    OR p_status IS NULL
    OR p_status NOT IN ('success', 'failed')
    OR p_attempt IS NULL
    OR p_attempt NOT BETWEEN 1 AND 100
    OR p_payload_json IS NULL
    OR jsonb_typeof(p_payload_json) <> 'object'
    OR p_occurred_at IS NULL
    OR length(p_intent_event_id) > 500
    OR length(COALESCE(p_correlation_id, '')) > 500
    OR length(COALESCE(p_reason, '')) > 1000
    OR pg_column_size(p_payload_json) > 65536
  THEN
    RAISE EXCEPTION 'invalid global email delivery attempt audit input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO integrator.delivery_attempt_logs (
    intent_type,
    intent_event_id,
    correlation_id,
    channel,
    status,
    attempt,
    reason,
    payload_json,
    occurred_at
  ) VALUES (
    NULLIF(p_intent_type, ''),
    NULLIF(p_intent_event_id, ''),
    NULLIF(p_correlation_id, ''),
    p_channel,
    p_status,
    p_attempt,
    p_reason,
    p_payload_json,
    p_occurred_at
  );
END
$function$;

ALTER FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) FROM PUBLIC, app_staff, app_patient, app_worker;

COMMENT ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) IS
  'Narrow app_owner capability for the integrator API base login to persist a global email delivery attempt without direct table or sequence privileges.';
