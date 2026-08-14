-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- Narrow patient catalog surface: public, bookable branch/service pairs for the signed clinic.
-- The patient runtime deliberately keeps no direct SELECT on catalog topology tables.

CREATE OR REPLACE FUNCTION app.read_current_patient_booking_catalog()
RETURNS TABLE (
  branch_id uuid,
  branch_title text,
  city_code text,
  branch_sort_order integer,
  service_id uuid,
  service_title text,
  service_description text,
  duration_minutes integer,
  price_minor integer,
  service_sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH principal AS (
    SELECT app.current_org_id() AS organization_id,
           app.current_patient_user_id() AS patient_user_id
  )
  SELECT DISTINCT
    branch.id,
    branch.title,
    branch.city_code,
    branch.sort_order,
    service.id,
    service.title,
    service.description,
    service.duration_minutes,
    service.price_minor,
    service.sort_order
  FROM principal
  JOIN public.org_enrollments enrollment
    ON enrollment.organization_id = principal.organization_id
   AND enrollment.platform_user_id = principal.patient_user_id
   AND enrollment.status = 'active'
  JOIN public.be_branches branch
    ON branch.organization_id = principal.organization_id
   AND branch.is_active = true
  JOIN public.be_specialist_service_availability availability
    ON availability.organization_id = principal.organization_id
   AND availability.branch_id = branch.id
   AND availability.is_active = true
  JOIN public.be_specialists specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = principal.organization_id
   AND specialist.is_active = true
  JOIN public.be_clinic_services service
    ON service.id = availability.service_id
   AND service.organization_id = principal.organization_id
   AND service.is_active = true
   AND service.public_widget_visible = true
   AND service.admin_manual_only = false
  WHERE principal.organization_id IS NOT NULL
    AND principal.patient_user_id IS NOT NULL
  ORDER BY branch.sort_order, branch.title, service.sort_order, service.title
$function$;
