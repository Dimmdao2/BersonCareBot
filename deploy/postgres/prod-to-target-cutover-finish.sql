\set ON_ERROR_STOP on

-- Recreate this check from the exact DEV definition. Its expression depends on
-- enum/composite objects rebuilt by the target schema, so keeping the old parsed
-- association would leave an otherwise text-identical schema diff.
ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT saas_isolation_events_source_operation_check;
ALTER TABLE public.saas_isolation_events
  ADD CONSTRAINT saas_isolation_events_source_operation_check
  CHECK (((((((((((((((((((((((((((source_service = 'webapp'::text) AND (source_operation = 'webapp_db_request'::text)) OR ((source_service = 'webapp'::text) AND (source_operation = 'webapp_admin_system_health'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_auth_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'auth_role_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_runtime_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_booking_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_identity_exception_check'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_booking_history'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_product_analytics'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_ui_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_calendar_timezone'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_content_catalog'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_diary'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_http_request'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_projection'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_queue_drain'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_projection_delivery'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_outgoing_delivery'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_lock'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_dispatch_tick'::text))) OR ((source_service = 'media_worker'::text) AND (source_operation = 'media_transcode_tick'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_health'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_media'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_analytics'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_reminders'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_specialist_tasks'::text)))) NOT VALID;
ALTER TABLE public.saas_isolation_events
  VALIDATE CONSTRAINT saas_isolation_events_source_operation_check;

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
