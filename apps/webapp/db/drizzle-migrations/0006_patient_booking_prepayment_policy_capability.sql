-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_prepayment_policy(
  p_service_id uuid,
  p_online_category text
)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  service_id uuid,
  online_category text,
  mode text,
  amount_minor integer,
  percent_bps integer,
  currency text,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL
     OR ((p_service_id IS NULL) = (p_online_category IS NULL)) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT policy.id, policy.organization_id, policy.service_id, policy.online_category,
         policy.mode, policy.amount_minor, policy.percent_bps, policy.currency, policy.is_active
  FROM public.be_prepayment_policies policy
  WHERE policy.organization_id = v_org
    AND (
      (p_service_id IS NOT NULL AND policy.service_id = p_service_id)
      OR (p_online_category IS NOT NULL AND policy.online_category = p_online_category)
    )
  LIMIT 1;
END
$function$;
