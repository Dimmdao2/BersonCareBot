-- taskdb #1046: /app/patient/booking was down for every patient on TEST — permission denied for
-- table be_branches (SQLSTATE 42501). apps/webapp/src/infra/repos/pgPatientBookings.ts enriched
-- each already-admitted booking row with its canonical branch/service display fields by issuing a
-- SECOND, raw query (LEFT JOIN be_appointments/be_branches/be_clinic_services/
-- be_specialist_service_availability/be_specialists) against the outer connection, which runs as
-- app_patient. deploy/postgres/public-booking-bootstrap-resolver.sql:158-170 asserts, on purpose,
-- that app_patient must NEVER hold direct SELECT on be_branches/be_clinic_services/
-- be_specialist_service_availability — that whole-class read is only supposed to happen through a
-- SECURITY DEFINER seam. The outer enrichment query above was reaching around that seam.
--
-- Fix: fold the enrichment into this function's own body instead of adding a table grant. This
-- function is already SECURITY DEFINER, already owned by app_owner, and app_owner already holds
-- SELECT on every table the enrichment reads:
--   - be_appointments, be_branches, be_clinic_services: granted by
--     deploy/postgres/e1-webapp-runtime-config.sql (lines ~58-65).
--   - be_specialist_service_availability: granted by
--     deploy/postgres/public-booking-bootstrap-resolver.sql (line 46, for the public-booking
--     bootstrap resolver; app_owner already reads it there for the same table).
--   - be_specialists: granted by deploy/postgres/e1-webapp-runtime-config.sql's earlier be_specialists
--     grant (pre-existing, doctor-side reads).
-- So this migration adds NO new GRANT anywhere, and it is CREATE OR REPLACE on the exact same name
-- and argument types as 0199_current_patient_booking_rows.sql — Postgres updates the existing
-- pg_proc row in place, ownership and ACL (EXECUTE granted to app_patient only, per
-- deploy/postgres/e1-webapp-runtime-config.sql's exact-ACL assertion) are untouched, and
-- deploy-test-saas.sh's `expected_secdef_count` pin does not move: this is still one function, not a
-- new one.
--
-- The enrichment logic itself is copied verbatim from the old outer TS query (same guards: booking
-- must be in_person, the linked canonical appointment/branch/service must all exist and be active,
-- the service must be public-widget-visible and not admin-manual-only, and there must be an active
-- specialist+availability row binding that exact specialist/branch/service combination — the exact
-- specialist_id binding is what prevents a same-org/branch/service availability row from exposing a
-- DIFFERENT specialist's slot display data for this appointment, see
-- pgPatientBookings.test.ts "derives canonical in-person navigation..."). The only structural change
-- is an added `appointment.organization_id = v_org` bind on the appointment join, matching the same
-- bound already enforced by the admission EXISTS check in the `scoped` CTE below (defense in depth:
-- a row only reaches `selected` because some appointment already proved `organization_id = v_org`,
-- but the enrichment join re-states it rather than trusting that upstream check silently).

CREATE OR REPLACE FUNCTION app.read_current_patient_booking_rows(
  p_kind text,
  p_now timestamptz
)
RETURNS TABLE (booking jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  IF v_org IS NULL OR v_patient IS NULL OR p_kind NOT IN ('upcoming', 'history') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH scoped AS MATERIALIZED (
    SELECT row.*
    FROM public.patient_bookings row
    WHERE row.platform_user_id = v_patient
      AND EXISTS (
        SELECT 1 FROM public.be_appointments appointment
        WHERE appointment.id = row.canonical_appointment_id
          AND appointment.organization_id = v_org
          AND appointment.platform_user_id = v_patient
          AND appointment.deleted_at IS NULL
      )
  ), selected AS (
    SELECT row.*
    FROM scoped row
    WHERE (
      p_kind = 'upcoming'
      AND row.cancelled_at IS NULL
      AND row.status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
      AND row.slot_start >= p_now
      AND NOT (row.status = 'creating' AND row.rubitime_id IS NULL AND row.canonical_appointment_id IS NULL)
      AND NOT (
        row.status = 'creating' AND EXISTS (
          SELECT 1 FROM scoped newer
          WHERE newer.id <> row.id
            AND newer.status IN ('awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
            AND newer.slot_start = row.slot_start AND newer.slot_end = row.slot_end
            AND COALESCE(newer.branch_service_id::text, '') = COALESCE(row.branch_service_id::text, '')
            AND COALESCE(newer.booking_type, '') = COALESCE(row.booking_type, '')
            AND COALESCE(newer.category, '') = COALESCE(row.category, '')
        )
      )
    ) OR (
      p_kind = 'history'
      AND (row.slot_start < p_now OR row.status IN ('cancelled','completed','no_show','failed_sync'))
    )
    ORDER BY
      CASE WHEN p_kind = 'upcoming' THEN row.slot_start END ASC,
      CASE WHEN p_kind = 'history' THEN row.slot_start END DESC,
      row.created_at DESC
    LIMIT 100
  ), enriched AS (
    -- The security-definer capability above decides which patient-booking rows belong to the
    -- signed tenant/patient. This enrichment only decorates an already-admitted linked canonical
    -- row with display fields. patient_bookings.branch_id/service_id/branch_service_id and their
    -- snapshot columns are never used as navigation or display inputs here.
    SELECT
      row.*,
      CASE
        WHEN row.booking_type = 'in_person'
          AND appointment.id IS NOT NULL
          AND branch.id IS NOT NULL
          AND service.id IS NOT NULL
          AND branch.is_active = TRUE
          AND service.is_active = TRUE
          AND service.public_widget_visible = TRUE
          AND service.admin_manual_only = FALSE
          AND EXISTS (
            SELECT 1
            FROM public.be_specialist_service_availability availability
            JOIN public.be_specialists specialist
              ON specialist.id = availability.specialist_id
             AND specialist.organization_id = availability.organization_id
             AND specialist.is_active = TRUE
            WHERE availability.organization_id = appointment.organization_id
              AND availability.specialist_id = appointment.specialist_id
              AND availability.branch_id = appointment.branch_id
              AND availability.service_id = appointment.service_id
              AND availability.is_active = TRUE
          )
        THEN jsonb_build_object(
          'branchId', appointment.branch_id,
          'serviceId', appointment.service_id,
          'cityCode', branch.city_code,
          'branchTitle', branch.title,
          'serviceTitle', service.title,
          'durationMinutes', appointment.duration_minutes,
          'priceMinor', service.price_minor
        )
        ELSE NULL
      END AS canonical_in_person_context
    FROM selected row
    LEFT JOIN public.be_appointments appointment
      ON appointment.id = row.canonical_appointment_id
     AND appointment.organization_id = v_org
    LEFT JOIN public.be_branches branch
      ON branch.id = appointment.branch_id
     AND branch.organization_id = appointment.organization_id
    LEFT JOIN public.be_clinic_services service
      ON service.id = appointment.service_id
     AND service.organization_id = appointment.organization_id
  )
  SELECT jsonb_build_object(
    'id', row.id, 'platform_user_id', row.platform_user_id, 'booking_type', row.booking_type,
    'city', row.city, 'category', row.category, 'slot_start', row.slot_start, 'slot_end', row.slot_end,
    'status', row.status, 'cancelled_at', row.cancelled_at, 'cancel_reason', row.cancel_reason,
    'rubitime_id', row.rubitime_id, 'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone, 'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at,
    'branch_id', row.branch_id, 'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot, 'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot, 'rubitime_branch_id_snapshot', row.rubitime_branch_id_snapshot,
    'rubitime_cooperator_id_snapshot', row.rubitime_cooperator_id_snapshot,
    'rubitime_service_id_snapshot', row.rubitime_service_id_snapshot, 'source', row.source,
    'compat_quality', row.compat_quality, 'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by, 'rubitime_manage_url', row.rubitime_manage_url,
    'canonical_appointment_id', row.canonical_appointment_id,
    'canonical_in_person_context', row.canonical_in_person_context
  )
  FROM enriched row;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_booking_rows(text,timestamptz) FROM PUBLIC;
