-- Final sequential migration number assigned by root after D30/0328 land.
-- Track D (docs/_TODO/runs/briefs/TRACK_D_LOGIN_DELIVERY_CAPABILITIES_BRIEF.md): the integrator
-- request-path login must never receive SELECT on public.system_settings to answer "is this
-- auth channel enabled" / "is this platform integration available", and must never receive
-- ambient DML on public.operator_incidents to open/touch a provider-failure incident. Three
-- narrow SECURITY DEFINER capabilities replace those direct reads/writes; the caller chooses
-- only within a fixed key allowlist (or no key at all).

CREATE OR REPLACE FUNCTION app.read_integrator_auth_channel_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'auth_email_enabled',
      'auth_sms_enabled',
      'auth_telegram_enabled',
      'auth_max_enabled'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_integrator_auth_channel_setting(text) IS
  'Fixed allowlist capability for the four global auth-channel enable flags; callers receive no system_settings table access.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.read_integrator_platform_integration_availability()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'platform_integration_availability'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_integrator_platform_integration_availability() IS
  'Argless capability for the global platform-integration availability registry; callers receive no system_settings table access.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.open_or_touch_operator_incident(
  p_dedup_key text,
  p_direction text,
  p_integration text,
  p_error_class text,
  p_error_detail text
)
RETURNS TABLE(id uuid, occurrence_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RETURN QUERY
  INSERT INTO public.operator_incidents (dedup_key, direction, integration, error_class, error_detail)
  VALUES (p_dedup_key, p_direction, p_integration, p_error_class, p_error_detail)
  ON CONFLICT (dedup_key) WHERE resolved_at IS NULL
  DO UPDATE SET
    last_seen_at = now(),
    occurrence_count = public.operator_incidents.occurrence_count + 1,
    error_detail = coalesce(excluded.error_detail, public.operator_incidents.error_detail)
  RETURNING public.operator_incidents.id, public.operator_incidents.occurrence_count;
END
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) IS
  'Open/touch capability for the exact provider-failure incident dedup row; callers receive no operator_incidents table DML.';
--> statement-breakpoint

DO $trackd_login_delivery_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.read_integrator_auth_channel_setting(text) OWNER TO app_owner;
    ALTER FUNCTION app.read_integrator_platform_integration_availability() OWNER TO app_owner;
    ALTER FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) OWNER TO app_owner;
  END IF;
END
$trackd_login_delivery_owner$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.read_integrator_auth_channel_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_platform_integration_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) FROM PUBLIC;
