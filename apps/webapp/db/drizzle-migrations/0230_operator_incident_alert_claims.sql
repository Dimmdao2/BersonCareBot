ALTER TABLE public.operator_incidents
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS one_hour_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_claim_phase text,
  ADD COLUMN IF NOT EXISTS alert_claim_token uuid,
  ADD COLUMN IF NOT EXISTS alert_claimed_at timestamptz;

ALTER TABLE public.operator_incidents
  DROP CONSTRAINT IF EXISTS operator_incidents_alert_claim_phase_check;
ALTER TABLE public.operator_incidents
  ADD CONSTRAINT operator_incidents_alert_claim_phase_check
  CHECK (alert_claim_phase IS NULL OR alert_claim_phase IN ('initial', 'one_hour_repeat'));

UPDATE public.operator_incidents
SET initial_alert_sent_at = alert_sent_at,
    one_hour_alert_sent_at = CASE
      WHEN alert_sent_at >= opened_at + interval '1 hour' THEN alert_sent_at
      ELSE one_hour_alert_sent_at
    END
WHERE alert_sent_at IS NOT NULL
  AND initial_alert_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_operator_incidents_provider_alert_due
  ON public.operator_incidents (opened_at, initial_alert_sent_at, one_hour_alert_sent_at, alert_claimed_at)
  WHERE resolved_at IS NULL
    AND acknowledged_at IS NULL
    AND direction = 'outbound_delivery_provider';

INSERT INTO public.system_settings (key, scope, value_json)
VALUES ('smsc_enabled', 'admin', '{"value": false}'::jsonb)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO integrator.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT key, scope, NULL, value_json, updated_at, updated_by
FROM public.system_settings
WHERE key IN ('smsc_enabled', 'smsc_api_key')
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.read_outbound_provider_incident_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'openCount', count(*)::int,
    'acknowledgedCount', count(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int,
    'unacknowledgedCount', count(*) FILTER (WHERE acknowledged_at IS NULL)::int
  )
  FROM public.operator_incidents
  WHERE resolved_at IS NULL
    AND direction = 'outbound_delivery_provider';
$$;

REVOKE ALL ON FUNCTION app.read_outbound_provider_incident_health() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_telemetry_operator') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.read_outbound_provider_incident_health() TO saas_telemetry_operator';
  END IF;
END
$$;
