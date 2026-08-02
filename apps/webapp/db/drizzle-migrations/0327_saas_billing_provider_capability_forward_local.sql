-- TEMPORARY LOCAL MIGRATION NUMBER 0327
-- #1057: clinic billing and the public SaaS webhook need the platform payment-provider
-- configuration, but neither caller may read the credential-bearing system_settings table.
-- Expose exactly one fixed-key capability; do not accept a caller-controlled key.

REVOKE SELECT ON TABLE public.system_settings FROM app_clinic_billing;
--> statement-breakpoint

DROP POLICY IF EXISTS system_settings_clinic_billing_global_read
  ON public.system_settings;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.read_saas_billing_payment_provider()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'saas_billing_payment_provider'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_saas_billing_payment_provider() IS
  'Fixed-key server capability for the platform SaaS payment provider; callers receive no system_settings table access.';
--> statement-breakpoint

DO $saas_billing_provider_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.read_saas_billing_payment_provider() OWNER TO app_owner;
  END IF;
END
$saas_billing_provider_owner$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.read_saas_billing_payment_provider() FROM PUBLIC;
--> statement-breakpoint

DO $saas_billing_provider_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_clinic_billing') THEN
    GRANT EXECUTE ON FUNCTION app.read_saas_billing_payment_provider() TO app_clinic_billing;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings') THEN
    GRANT EXECUTE ON FUNCTION app.read_saas_billing_payment_provider() TO app_platform_settings;
  END IF;
END
$saas_billing_provider_grants$;
