-- #1069 TEST closure: keep one frozen/live tariff calculation, but stop exposing that unscoped
-- implementation directly to tenant roles. The current-organization wrapper below is the only
-- tenant-callable entry point. app.accept_org_invite() intentionally continues to call the
-- unscoped implementation from its own narrow SECURITY DEFINER boundary: invite redemption runs
-- before the invited doctor has an organization principal, so imposing current_org_id there would
-- break the human path that creates that principal.

DROP FUNCTION IF EXISTS app.enforce_courses_snapshot_quota();
DROP FUNCTION IF EXISTS app.enforce_cms_pages_snapshot_quota();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.saas_billing_effective_tariff_for_current_org(
  p_organization_id uuid,
  p_tariff_id uuid
)
RETURNS SETOF public.saas_tariffs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_tariff_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM app.saas_billing_effective_tariff(p_organization_id, p_tariff_id);
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.saas_billing_effective_tariff_for_current_org(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.saas_billing_effective_tariff_for_current_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.saas_billing_effective_tariff_for_current_org(uuid, uuid)
  TO app_staff, app_patient, app_clinic_billing;

-- The implementation remains callable by app_owner-owned exact capability functions, including
-- pre-principal invite redemption, but is no longer a tenant-role escape hatch.
REVOKE EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid, uuid)
  FROM app_staff, app_patient, app_clinic_billing;
GRANT EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid, uuid)
  TO app_platform_settings;
