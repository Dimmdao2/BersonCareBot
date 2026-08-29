-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.resolve_outbound_provider_incidents_after_delivery(text)') IS NOT NULL
-- A confirmed real delivery is the recovery signal for its provider channel. Keep the raw incident
-- journal closed and expose one narrow delivery-worker capability that can resolve only outbound
-- provider incidents for one fixed channel.
CREATE OR REPLACE FUNCTION app.resolve_outbound_provider_incidents_after_delivery(
  p_integration text
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  v_resolved integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_operational_delivery_worker'::name,
    'service'::app.port_context_class,
    'health.outbound-provider.recover',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.resolve_outbound_provider_incidents_after_delivery(text)'::regprocedure
  );

  IF p_integration IS NULL OR p_integration NOT IN (
    'telegram', 'max', 'vk', 'email', 'smsc', 'web_push'
  ) THEN
    RAISE EXCEPTION 'invalid outbound provider integration' USING ERRCODE = '22023';
  END IF;

  WITH resolved AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now(),
        alert_claim_phase = NULL,
        alert_claim_token = NULL,
        alert_claimed_at = NULL
    WHERE incident.resolved_at IS NULL
      AND incident.direction = 'outbound_delivery_provider'
      AND incident.integration = p_integration
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$function$
;
