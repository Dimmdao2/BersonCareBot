-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_current_patient_booking_rows(text,timestamp with time zone)'::regprocedure) LIKE '%''timezone'', branch.timezone%' AND pg_catalog.pg_get_functiondef('app.read_current_patient_booking_row(uuid,text)'::regprocedure) LIKE '%''timezone'', branch.timezone%'
--
-- PATIENT-OVERVIEW-08/09/10 (docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md): patient
-- surfaces must render an in-person appointment's time in the branch's own IANA zone, not the
-- global app display zone, and compare it against the patient device's offset at the appointment
-- instant. `canonical_in_person_context` already joins `be_branches` for title/city — this adds the
-- one missing column (`timezone`) the webapp needs to resolve and compare that zone; no new join,
-- no new relation.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_rows(p_kind text, p_now timestamp with time zone) RETURNS TABLE(booking jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_booking_owner'::name, ARRAY['app_patient'::name]::name[]);

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
      AND (
        row.organization_id IS NULL
        OR (
          row.organization_id = v_org
          AND EXISTS (
            SELECT 1 FROM public.be_appointments appointment
            WHERE appointment.id = row.canonical_appointment_id
              AND appointment.organization_id = v_org
              AND appointment.platform_user_id = v_patient
              AND appointment.deleted_at IS NULL
          )
        )
      )
  ), selected AS (
    SELECT row.*
    FROM scoped row
    WHERE (
      p_kind = 'upcoming'
      AND row.cancelled_at IS NULL
      AND row.status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
      AND row.slot_end > p_now
      AND NOT (row.status = 'creating' AND row.canonical_appointment_id IS NULL)
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
      AND (row.slot_end <= p_now OR row.status IN ('cancelled','completed','no_show','failed_sync'))
    )
    ORDER BY
      CASE WHEN p_kind = 'upcoming' THEN row.slot_start END ASC,
      CASE WHEN p_kind = 'history' THEN row.slot_start END DESC,
      row.created_at DESC
    LIMIT 100
  ), enriched AS (
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
          'priceMinor', service.price_minor,
          'timezone', branch.timezone
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
    'id', row.id, 'organization_id', row.organization_id, 'platform_user_id', row.platform_user_id,
    'booking_type', row.booking_type, 'city', row.city, 'category', row.category,
    'slot_start', row.slot_start, 'slot_end', row.slot_end, 'status', row.status,
    'cancelled_at', row.cancelled_at, 'cancel_reason', row.cancel_reason, 'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone,
    'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at, 'branch_id', row.branch_id,
    'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot,
    'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot,
    'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by,
    'canonical_appointment_id', row.canonical_appointment_id,
    'canonical_in_person_context', row.canonical_in_person_context
  )
  FROM enriched row;
END
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Same `canonical_in_person_context` the plural row-list capability above already computes; the
-- single-row read (used by the booking success screen and lifecycle actions) never carried it, so
-- every consumer going through `getById`/`getByIdForUser`/`getByCanonicalAppointmentId` for the
-- current-patient principal silently saw `canonicalInPersonContext: null`. Same owner, same joined
-- relations, same eligibility predicate — no new pass.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_row(p_id uuid, p_kind text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_booking public.patient_bookings%ROWTYPE;
  v_context jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-row.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_current_patient_booking_row(uuid,text)'::regprocedure);
  IF p_kind NOT IN ('booking', 'appointment') THEN
    RAISE EXCEPTION 'unsupported patient booking row kind' USING ERRCODE = '22023';
  END IF;

  SELECT booking.* INTO v_booking
  FROM public.patient_bookings booking
  WHERE booking.organization_id = v_org
    AND booking.platform_user_id = v_patient
    AND ((p_kind = 'booking' AND booking.id = p_id)
      OR (p_kind = 'appointment' AND booking.canonical_appointment_id = p_id))
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    CASE
      WHEN v_booking.booking_type = 'in_person'
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
        'priceMinor', service.price_minor,
        'timezone', branch.timezone
      )
      ELSE NULL
    END
  INTO v_context
  FROM public.be_appointments appointment
  LEFT JOIN public.be_branches branch
    ON branch.id = appointment.branch_id
   AND branch.organization_id = appointment.organization_id
  LEFT JOIN public.be_clinic_services service
    ON service.id = appointment.service_id
   AND service.organization_id = appointment.organization_id
  WHERE appointment.id = v_booking.canonical_appointment_id
    AND appointment.organization_id = v_org;

  RETURN to_jsonb(v_booking) || jsonb_build_object('canonical_in_person_context', v_context);
END
$_$;
