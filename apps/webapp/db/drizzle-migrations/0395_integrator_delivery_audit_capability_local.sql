-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- Integrator delivery runtime after the privilege cutover:
--   * reuse the canonical provider-settings reader for the non-secret verbose-log flag;
--   * persist every delivery outcome through one exact SECURITY DEFINER root;
--   * retire the two older partial helpers (email-only and overlay-only verbose reader).

CREATE OR REPLACE FUNCTION app.read_integrator_provider_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'telegram_bot_token',
      'telegram_webhook_secret',
      'telegram_send_menu_on_button_press',
      'max_bot_api_key',
      'max_webhook_secret',
      'max_api_base_url',
      'smsc_enabled',
      'smsc_api_key',
      'smsc_base_url',
      'debug_forward_to_admin'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
COMMENT ON FUNCTION app.read_integrator_provider_runtime_setting(text) IS
  'Fixed allowlist capability for global integrator provider configuration and the non-secret operational verbose-log flag; callers receive no system_settings table access.';
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
DROP FUNCTION IF EXISTS app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, jsonb, timestamptz
);
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_operational_delivery_attempt_audit(
  p_intent_type text,
  p_intent_event_id text,
  p_correlation_id text,
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
    intent_type, intent_event_id, correlation_id, channel,
    status, attempt, reason, payload_json, occurred_at
  ) VALUES (
    NULLIF(p_intent_type, ''),
    NULLIF(p_intent_event_id, ''),
    NULLIF(p_correlation_id, ''),
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
  text, text, text, text, text, integer, text, text, timestamptz
) IS
  'Exact integrator-port capability for PII-redacted delivery-attempt audit rows across every supported channel.';
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE integrator.delivery_attempt_logs
  DROP CONSTRAINT IF EXISTS delivery_attempt_logs_status_check;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE integrator.delivery_attempt_logs
  ADD CONSTRAINT delivery_attempt_logs_status_check
  CHECK (status = ANY (ARRAY['success'::text, 'failed'::text, 'skipped'::text]));
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
REVOKE ALL ON FUNCTION app.read_integrator_provider_runtime_setting(text) FROM PUBLIC;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, text, timestamptz
) FROM PUBLIC;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
DROP FUNCTION IF EXISTS app.read_operational_verbose_log_flag();
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
DROP FUNCTION IF EXISTS app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
);
