-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0016
-- Owner 2026-08-17: START must state a real branch stock, and the canonical Developer tariff is
-- explicitly unlimited. Repair only these named tariffs and only when the quota key is absent;
-- never overwrite an owner-set quota. Stock mechanics live in quotas, not the ability-toggle map.
UPDATE public.saas_tariffs
SET quotas = jsonb_set(
      quotas,
      '{branches}',
      CASE lower(btrim(name))
        WHEN 'developer' THEN '{"kind":"unlimited","limit":null,"unit":"items"}'::jsonb
        ELSE '{"kind":"numeric","limit":1,"unit":"items"}'::jsonb
      END,
      true
    ),
    updated_at = now()
WHERE lower(btrim(name)) IN ('start', 'developer')
  AND NOT (quotas ? 'branches');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.list_saas_billing_period_catalog()
RETURNS TABLE (
  code text,
  label text,
  months integer,
  is_selectable boolean,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner',
    'app_clinic_billing',
    'staff',
    'billing.clinic.period-catalog.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_saas_billing_period_catalog()'::regprocedure
  );
  RETURN QUERY
  SELECT period.code, period.label, period.months, period.is_selectable, period.sort_order
  FROM public.saas_billing_periods AS period
  ORDER BY period.sort_order, period.code;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.list_saas_billing_period_catalog_platform()
RETURNS TABLE (
  code text,
  label text,
  months integer,
  is_selectable boolean,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner',
    'app_platform_settings',
    'platform',
    'billing.platform.period-catalog.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_saas_billing_period_catalog_platform()'::regprocedure
  );
  RETURN QUERY
  SELECT period.code, period.label, period.months, period.is_selectable, period.sort_order
  FROM public.saas_billing_periods AS period
  ORDER BY period.sort_order, period.code;
END
$function$;
