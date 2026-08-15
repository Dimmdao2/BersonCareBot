-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Preserve the tenant discriminator supplied by the delivery path and reject unattributed writes.
CREATE OR REPLACE FUNCTION app.record_operational_delivery_attempt_audit(
  p_intent_type text,
  p_intent_event_id text,
  p_correlation_id text,
  p_organization_id uuid,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text,
  p_payload_text text,
  p_occurred_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_payload_json jsonb;
BEGIN
  v_payload_json := p_payload_text::jsonb;

  IF p_intent_type IS NULL
    OR NULLIF(btrim(p_intent_event_id), '') IS NULL
    OR p_organization_id IS NULL
    OR p_channel IS NULL
    OR p_channel NOT IN ('max', 'telegram', 'smsc', 'web_push', 'email', 'unknown')
    OR p_status IS NULL
    OR p_status NOT IN ('success', 'failed', 'skipped')
    OR p_attempt IS NULL
    OR p_attempt NOT BETWEEN 1 AND 100
    OR v_payload_json IS NULL
    OR jsonb_typeof(v_payload_json) <> 'object'
    OR p_occurred_at IS NULL
    OR length(p_intent_type) > 200
    OR length(p_intent_event_id) > 500
    OR length(COALESCE(p_correlation_id, '')) > 500
    OR length(COALESCE(p_reason, '')) > 1000
    OR pg_column_size(v_payload_json) > 65536
  THEN
    RAISE EXCEPTION 'invalid operational delivery attempt audit input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO integrator.delivery_attempt_logs (
    intent_type, intent_event_id, correlation_id, organization_id, channel,
    status, attempt, reason, payload_json, occurred_at
  ) VALUES (
    NULLIF(p_intent_type, ''),
    NULLIF(p_intent_event_id, ''),
    NULLIF(p_correlation_id, ''),
    p_organization_id,
    p_channel,
    p_status,
    p_attempt,
    NULLIF(p_reason, ''),
    v_payload_json,
    p_occurred_at
  );
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
COMMENT ON FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, uuid, text, text, integer, text, text, timestamptz
) IS
  'Exact integrator-port capability for tenant-attributed PII-redacted delivery-attempt audit rows.';
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
DROP FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, text, timestamptz
);
