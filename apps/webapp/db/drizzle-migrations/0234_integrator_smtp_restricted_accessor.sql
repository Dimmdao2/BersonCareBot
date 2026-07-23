-- 0234_integrator_smtp_restricted_accessor: the integrator email delivery path may read only the
-- global SMTP credential envelope, without ambient SELECT on restricted settings or tenant context.

CREATE OR REPLACE FUNCTION app.read_integrator_smtp_outbound_setting()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'smtp_outbound'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

ALTER FUNCTION app.read_integrator_smtp_outbound_setting() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting()
  FROM app_staff, app_patient, app_worker;
