\set ON_ERROR_STOP on

DROP SCHEMA cutover_source_integrator CASCADE;
DROP SCHEMA cutover_source_drizzle CASCADE;
DROP SCHEMA cutover_source_public CASCADE;

DO $final_shape_gate$
DECLARE
  violations bigint;
BEGIN
  IF to_regnamespace('cutover_source_public') IS NOT NULL
     OR to_regnamespace('cutover_source_integrator') IS NOT NULL
     OR to_regnamespace('cutover_source_drizzle') IS NOT NULL THEN
    RAISE EXCEPTION 'cutover source schemas remain after cleanup';
  END IF;

  SELECT count(*) INTO violations
  FROM public.platform_users
  WHERE merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_identity identity_row
      WHERE identity_row.platform_user_id = platform_users.id
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'canonical users without user_identity: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.be_appointments appointment
  LEFT JOIN public.be_specialists specialist
    ON specialist.id = appointment.specialist_id
   AND specialist.organization_id = appointment.organization_id
  WHERE appointment.deleted_at IS NULL
    AND (specialist.id IS NULL OR NOT specialist.is_active);
  IF violations <> 0 THEN RAISE EXCEPTION 'live appointments without active specialist: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.be_appointments appointment
  JOIN public.platform_users patient ON patient.id = appointment.platform_user_id
  WHERE appointment.deleted_at IS NULL
    AND patient.role = 'client'
    AND patient.merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = appointment.organization_id
        AND enrollment.platform_user_id = appointment.platform_user_id
        AND enrollment.status = 'active'
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'appointment patients without active enrollment: %', violations; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.be_organization_members
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND role = 'doctor'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'canonical doctor membership was not rebuilt';
  END IF;
END
$final_shape_gate$;

COMMIT;

SELECT json_build_object(
  'status', 'pass',
  'platformUsers', (SELECT count(*) FROM public.platform_users),
  'userIdentities', (SELECT count(*) FROM public.user_identity),
  'appointments', (SELECT count(*) FROM public.be_appointments),
  'activeEnrollments', (SELECT count(*) FROM public.org_enrollments WHERE status = 'active'),
  'calendarMappings', (SELECT count(*) FROM public.booking_calendar_map),
  'pendingDeliveryQueue', (
    SELECT count(*) FROM public.outgoing_delivery_queue
    WHERE status IN ('pending', 'processing', 'failed_retryable')
  )
) AS prod_to_target_cutover;
