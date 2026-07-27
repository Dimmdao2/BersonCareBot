-- Remove the remaining Rubitime-owned data surface after the provider integration cutoff.
--
-- This migration is intentionally idempotent: source rewrites are guarded by their old value,
-- constraints/indexes/columns/tables use repeat-safe DDL, and the patient capability is replaced
-- in place (same pg_proc identity, owner and ACL). It must remain safe for strict overlay replay.

-- 1. DROP the old CHECKs FIRST. Ordering matters and was wrong in the first cut: the rewrite below
--    sets source='imported', which the OLD constraint does not allow, so updating before dropping
--    fails with "violates check constraint patient_bookings_source_check" on the very first row.
--    Caught by a rolled-back dry run against the live TEST database, not by review.
ALTER TABLE IF EXISTS public.patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_source_check;
--> statement-breakpoint
ALTER TABLE IF EXISTS public.be_appointments
  DROP CONSTRAINT IF EXISTS be_appointments_source_check;
--> statement-breakpoint

-- 2. Preserve only neutral import provenance; the provider name leaves the data.
UPDATE public.patient_bookings
SET source = 'imported'
WHERE source = 'rubitime_projection';
--> statement-breakpoint
UPDATE public.be_appointments
SET source = 'imported'
WHERE source = 'rubitime_projection';
--> statement-breakpoint

-- 3. Re-add the CHECKs in their final shape: the retired provider value is no longer accepted.
ALTER TABLE IF EXISTS public.patient_bookings
  ADD CONSTRAINT patient_bookings_source_check
  CHECK (source = ANY (ARRAY['native'::text, 'imported'::text]));
--> statement-breakpoint
ALTER TABLE IF EXISTS public.be_appointments
  ADD CONSTRAINT be_appointments_source_check
  CHECK (source = ANY (ARRAY[
    'native'::text,
    'imported'::text,
    'admin_manual'::text,
    'public_widget'::text
  ]));
--> statement-breakpoint

-- app.read_current_patient_booking_rows is the only live database capability that read the
-- patient_bookings Rubitime columns. Replace its body before dropping them. CREATE OR REPLACE keeps
-- the existing SECURITY DEFINER pg_proc row, ownership and exact EXECUTE ACL, so the pinned
-- deploy-test-saas expected_secdef_count remains 106.
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
    'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone, 'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at,
    'branch_id', row.branch_id, 'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot, 'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot, 'source', row.source,
    'compat_quality', row.compat_quality, 'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by,
    'canonical_appointment_id', row.canonical_appointment_id,
    'canonical_in_person_context', row.canonical_in_person_context
  )
  FROM enriched row;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.read_current_patient_booking_rows(text,timestamptz) FROM PUBLIC;
--> statement-breakpoint

-- 3. Remove indexes before their columns.
-- Drizzle declared patient_bookings_rubitime_id_key as a UNIQUE constraint, so PostgreSQL owns its
-- backing index through that constraint. Drop the constraint first, then defensively drop a
-- same-named standalone index if a drifted database has one instead.
ALTER TABLE IF EXISTS public.patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_rubitime_id_key;
--> statement-breakpoint
DROP INDEX IF EXISTS public.patient_bookings_rubitime_id_key;
--> statement-breakpoint
DROP INDEX IF EXISTS public.idx_patient_bookings_rubitime_id;
--> statement-breakpoint
DROP INDEX IF EXISTS public.idx_booking_branches_rubitime_id;
--> statement-breakpoint
DROP INDEX IF EXISTS public.idx_booking_specialists_rubitime_id;
--> statement-breakpoint

ALTER TABLE IF EXISTS public.booking_branch_services
  DROP COLUMN IF EXISTS rubitime_service_id;
--> statement-breakpoint
ALTER TABLE IF EXISTS public.booking_branches
  DROP COLUMN IF EXISTS rubitime_branch_id;
--> statement-breakpoint
ALTER TABLE IF EXISTS public.booking_specialists
  DROP COLUMN IF EXISTS rubitime_cooperator_id;
--> statement-breakpoint
ALTER TABLE IF EXISTS public.patient_bookings
  DROP COLUMN IF EXISTS rubitime_id,
  DROP COLUMN IF EXISTS rubitime_manage_url,
  DROP COLUMN IF EXISTS rubitime_branch_id_snapshot,
  DROP COLUMN IF EXISTS rubitime_cooperator_id_snapshot,
  DROP COLUMN IF EXISTS rubitime_service_id_snapshot;
--> statement-breakpoint

-- 4. Drop the provider tables in FK-safe child-first order. booking_calendar_map is also removed:
-- it exists only to relate a retired Rubitime record id to a Google Calendar event id.
DROP TABLE IF EXISTS integrator.booking_calendar_map;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_booking_profiles;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_events;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_records;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_api_throttle;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_branches;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_services;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.rubitime_cooperators;
