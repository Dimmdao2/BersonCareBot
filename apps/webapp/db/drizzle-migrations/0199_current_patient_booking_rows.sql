-- 0199_current_patient_booking_rows: bounded tenant-safe projection for legacy booking rows.
-- patient_bookings has no organization_id, therefore rows are admitted only when a canonical
-- appointment proves the current signed organization. Ambiguous legacy rows fail closed.

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
    'canonical_appointment_id', row.canonical_appointment_id
  )
  FROM selected row;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_booking_rows(text,timestamptz) FROM PUBLIC;
