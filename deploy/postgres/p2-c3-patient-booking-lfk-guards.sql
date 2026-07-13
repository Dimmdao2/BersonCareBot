-- Phase 2 / P2-C3 patient booking lifecycle + LFK value-level guards.
--
-- Applies after P2-B protected principal context. These invoker-mode triggers close booking
-- lifecycle value residuals and stamp/verify lfk_sessions.organization_id for patient-context writes.

\set ON_ERROR_STOP on
\pset pager off

\if :{?p2_c3_down}
DROP TRIGGER IF EXISTS p2_c3_be_appointments_patient_insert_guard ON public.be_appointments;
DROP TRIGGER IF EXISTS p2_c3_be_appointments_patient_update_guard ON public.be_appointments;
DROP TRIGGER IF EXISTS p2_c3_be_appointment_reschedules_patient_write_guard ON public.be_appointment_reschedules;
DROP TRIGGER IF EXISTS p2_c3_be_appointment_cancellations_patient_write_guard ON public.be_appointment_cancellations;
DROP TRIGGER IF EXISTS p2_c3_be_appointment_events_patient_insert_guard ON public.be_appointment_events;
DROP TRIGGER IF EXISTS p2_c3_be_appointment_history_events_patient_insert_guard ON public.be_appointment_history_events;
DROP TRIGGER IF EXISTS p2_c3_lfk_sessions_patient_write_guard ON public.lfk_sessions;
DROP FUNCTION IF EXISTS app.p2_c3_guard_lfk_sessions();
DROP FUNCTION IF EXISTS app.p2_c3_guard_be_appointment_event_insert();
DROP FUNCTION IF EXISTS app.p2_c3_guard_be_appointment_cancellations();
DROP FUNCTION IF EXISTS app.p2_c3_guard_be_appointment_reschedules();
DROP FUNCTION IF EXISTS app.p2_c3_guard_be_appointments();
DROP FUNCTION IF EXISTS app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.p2_c3_booking_row_is_owned(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.p2_c3_is_patient_context();
\echo 'P2-C3 patient booking/LFK value guards DOWN complete.'
\quit
\endif

\if :{?p2_c3_staff_role}
\else
\set p2_c3_staff_role app_staff
\endif

\if :{?p2_c3_patient_role}
\else
\set p2_c3_patient_role app_patient
\endif

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c3_staff_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c3_patient_role')
)::int AS p2_c3_roles_exist \gset

\if :p2_c3_roles_exist
\else
\echo 'FATAL: P2-C3 explicit grants require p2_c3_staff_role/p2_c3_patient_role to exist.'
SELECT 1 / 0 AS p2_c3_abort;
\endif

CREATE OR REPLACE FUNCTION app.p2_c3_is_patient_context() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, pg_catalog
AS $$
  SELECT app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_booking_row_is_owned(
  p_appointment_id uuid,
  p_org_id uuid,
  p_patient_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.be_appointments appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = p_org_id
      AND appointment.platform_user_id = p_patient_user_id
  )
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_lfk_complex_is_owned(
  p_complex_id uuid,
  p_org_id uuid,
  p_patient_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lfk_complexes complex
    WHERE complex.id = p_complex_id
      AND complex.organization_id = p_org_id
      AND (
        complex.platform_user_id = p_patient_user_id
        OR (
          complex.platform_user_id IS NULL
          AND complex.user_id = p_patient_user_id::text
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_guard_be_appointments() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c3_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'patient_booking_org_context_missing';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS DISTINCT FROM v_org_id
      OR NEW.platform_user_id IS DISTINCT FROM v_patient_user_id THEN
      RAISE EXCEPTION 'patient_booking_appointment_owner_mismatch';
    END IF;

    IF NEW.source NOT IN ('native', 'public_widget')
      OR NEW.status NOT IN ('confirmed', 'awaiting_payment')
      OR NEW.original_start_at IS DISTINCT FROM NEW.start_at
      OR NEW.reschedule_count IS DISTINCT FROM 0
      OR NEW.payment_ref IS NOT NULL
      OR NEW.package_usage_ref IS NOT NULL
      OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'patient_booking_appointment_insert_value_forbidden';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.organization_id IS DISTINCT FROM v_org_id
    OR OLD.platform_user_id IS DISTINCT FROM v_patient_user_id
    OR NEW.organization_id IS DISTINCT FROM v_org_id
    OR NEW.platform_user_id IS DISTINCT FROM v_patient_user_id THEN
    RAISE EXCEPTION 'patient_booking_appointment_owner_mismatch';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
    OR NEW.package_usage_ref IS DISTINCT FROM OLD.package_usage_ref
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'patient_booking_appointment_protected_column_forbidden';
  END IF;

  IF NEW.status IN ('cancelled_by_patient', 'late_cancellation')
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
    AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
    AND NEW.specialist_id IS NOT DISTINCT FROM OLD.specialist_id
    AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
    AND NEW.platform_user_id IS NOT DISTINCT FROM OLD.platform_user_id
    AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at
    AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
    AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
    AND NEW.source IS NOT DISTINCT FROM OLD.source
    AND NEW.original_start_at IS NOT DISTINCT FROM OLD.original_start_at
    AND NEW.reschedule_count IS NOT DISTINCT FROM OLD.reschedule_count
    AND NEW.phone_normalized IS NOT DISTINCT FROM OLD.phone_normalized
    AND NEW.attribution_json IS NOT DISTINCT FROM OLD.attribution_json
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'rescheduled'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
    AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
    AND NEW.specialist_id IS NOT DISTINCT FROM OLD.specialist_id
    AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
    AND NEW.platform_user_id IS NOT DISTINCT FROM OLD.platform_user_id
    AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at
    AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
    AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
    AND NEW.source IS NOT DISTINCT FROM OLD.source
    AND NEW.original_start_at IS NOT DISTINCT FROM OLD.original_start_at
    AND NEW.reschedule_count IS NOT DISTINCT FROM OLD.reschedule_count
    AND NEW.phone_normalized IS NOT DISTINCT FROM OLD.phone_normalized
    AND NEW.attribution_json IS NOT DISTINCT FROM OLD.attribution_json
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'rescheduled'
    AND NEW.status = 'confirmed'
    AND NEW.reschedule_count = OLD.reschedule_count + 1
    AND NEW.original_start_at IS NOT DISTINCT FROM COALESCE(OLD.original_start_at, OLD.start_at)
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.platform_user_id IS NOT DISTINCT FROM OLD.platform_user_id
    AND NEW.source IS NOT DISTINCT FROM OLD.source
    AND NEW.phone_normalized IS NOT DISTINCT FROM OLD.phone_normalized
    AND NEW.attribution_json IS NOT DISTINCT FROM OLD.attribution_json
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'patient_booking_appointment_update_shape_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_guard_be_appointment_reschedules() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c3_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'patient_booking_org_context_missing';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS DISTINCT FROM v_org_id
      OR NOT app.p2_c3_booking_row_is_owned(NEW.appointment_id, v_org_id, v_patient_user_id) THEN
      RAISE EXCEPTION 'patient_booking_reschedule_appointment_not_owned';
    END IF;

    IF NEW.actor_type IS DISTINCT FROM 'patient'
      OR NEW.actor_id IS DISTINCT FROM v_patient_user_id
      OR NEW.staff_comment IS NOT NULL
      OR NEW.manual_override IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'patient_booking_reschedule_value_forbidden';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.organization_id IS DISTINCT FROM v_org_id
    OR NEW.organization_id IS DISTINCT FROM v_org_id
    OR NOT app.p2_c3_booking_row_is_owned(OLD.appointment_id, v_org_id, v_patient_user_id) THEN
    RAISE EXCEPTION 'patient_booking_reschedule_appointment_not_owned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.be_appointment_reschedules newer
    WHERE newer.appointment_id = OLD.appointment_id
      AND newer.organization_id = OLD.organization_id
      AND newer.created_at > OLD.created_at
  ) THEN
    RAISE EXCEPTION 'patient_booking_reschedule_notifications_not_latest';
  END IF;

  IF NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.appointment_id IS NOT DISTINCT FROM OLD.appointment_id
    AND NEW.from_start_at IS NOT DISTINCT FROM OLD.from_start_at
    AND NEW.from_end_at IS NOT DISTINCT FROM OLD.from_end_at
    AND NEW.to_start_at IS NOT DISTINCT FROM OLD.to_start_at
    AND NEW.to_end_at IS NOT DISTINCT FROM OLD.to_end_at
    AND NEW.actor_type IS NOT DISTINCT FROM OLD.actor_type
    AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
    AND NEW.was_in_free_reschedule_window IS NOT DISTINCT FROM OLD.was_in_free_reschedule_window
    AND NEW.free_cancellation_available_at_reschedule IS NOT DISTINCT FROM OLD.free_cancellation_available_at_reschedule
    AND NEW.free_cancellation_available_after IS NOT DISTINCT FROM OLD.free_cancellation_available_after
    AND NEW.applied_policy_id IS NOT DISTINCT FROM OLD.applied_policy_id
    AND NEW.applied_policy_snapshot IS NOT DISTINCT FROM OLD.applied_policy_snapshot
    AND NEW.reason IS NOT DISTINCT FROM OLD.reason
    AND NEW.staff_comment IS NOT DISTINCT FROM OLD.staff_comment
    AND NEW.manual_override IS NOT DISTINCT FROM OLD.manual_override
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'patient_booking_reschedule_update_shape_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_guard_be_appointment_cancellations() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c3_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'patient_booking_org_context_missing';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS DISTINCT FROM v_org_id
      OR NOT app.p2_c3_booking_row_is_owned(NEW.appointment_id, v_org_id, v_patient_user_id) THEN
      RAISE EXCEPTION 'patient_booking_cancellation_appointment_not_owned';
    END IF;

    IF NEW.actor_type IS DISTINCT FROM 'patient'
      OR NEW.actor_id IS DISTINCT FROM v_patient_user_id
      OR NEW.staff_comment IS NOT NULL
      OR NEW.manual_override IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'patient_booking_cancellation_value_forbidden';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.organization_id IS DISTINCT FROM v_org_id
    OR NEW.organization_id IS DISTINCT FROM v_org_id
    OR NOT app.p2_c3_booking_row_is_owned(OLD.appointment_id, v_org_id, v_patient_user_id) THEN
    RAISE EXCEPTION 'patient_booking_cancellation_appointment_not_owned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.be_appointment_cancellations newer
    WHERE newer.appointment_id = OLD.appointment_id
      AND newer.organization_id = OLD.organization_id
      AND newer.created_at > OLD.created_at
  ) THEN
    RAISE EXCEPTION 'patient_booking_cancellation_notifications_not_latest';
  END IF;

  IF NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.appointment_id IS NOT DISTINCT FROM OLD.appointment_id
    AND NEW.actor_type IS NOT DISTINCT FROM OLD.actor_type
    AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
    AND NEW.cancellation_type IS NOT DISTINCT FROM OLD.cancellation_type
    AND NEW.reason IS NOT DISTINCT FROM OLD.reason
    AND NEW.was_free IS NOT DISTINCT FROM OLD.was_free
    AND NEW.was_penalized IS NOT DISTINCT FROM OLD.was_penalized
    AND NEW.package_session_charged IS NOT DISTINCT FROM OLD.package_session_charged
    AND NEW.prepayment_retained IS NOT DISTINCT FROM OLD.prepayment_retained
    AND NEW.prepayment_refunded IS NOT DISTINCT FROM OLD.prepayment_refunded
    AND NEW.staff_comment IS NOT DISTINCT FROM OLD.staff_comment
    AND NEW.manual_override IS NOT DISTINCT FROM OLD.manual_override
    AND NEW.applied_policy_id IS NOT DISTINCT FROM OLD.applied_policy_id
    AND NEW.applied_policy_snapshot IS NOT DISTINCT FROM OLD.applied_policy_snapshot
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'patient_booking_cancellation_update_shape_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_guard_be_appointment_event_insert() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c3_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'patient_booking_org_context_missing';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_org_id
    OR NOT app.p2_c3_booking_row_is_owned(NEW.appointment_id, v_org_id, v_patient_user_id) THEN
    RAISE EXCEPTION 'patient_booking_event_appointment_not_owned';
  END IF;

  IF NEW.actor_id IS DISTINCT FROM v_patient_user_id
    OR NEW.event_type NOT IN ('created', 'cancelled', 'rescheduled') THEN
    RAISE EXCEPTION 'patient_booking_event_value_forbidden';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c3_guard_lfk_sessions() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c3_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'patient_lfk_session_org_context_missing';
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      OLD.organization_id IS DISTINCT FROM v_org_id
      OR OLD.user_id IS DISTINCT FROM v_patient_user_id
      OR NOT app.p2_c3_lfk_complex_is_owned(OLD.complex_id, v_org_id, v_patient_user_id)
    ) THEN
    RAISE EXCEPTION 'patient_lfk_session_old_row_not_owned';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_org_id
    OR NEW.user_id IS DISTINCT FROM v_patient_user_id
    OR NOT app.p2_c3_lfk_complex_is_owned(NEW.complex_id, v_org_id, v_patient_user_id) THEN
    RAISE EXCEPTION 'patient_lfk_session_new_row_not_owned';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.p2_c3_is_patient_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_booking_row_is_owned(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_guard_be_appointments() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_reschedules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_cancellations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_event_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c3_guard_lfk_sessions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.p2_c3_is_patient_context()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_booking_row_is_owned(uuid, uuid, uuid)
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid)
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_guard_be_appointments()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_reschedules()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_cancellations()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_guard_be_appointment_event_insert()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c3_guard_lfk_sessions()
  TO :"p2_c3_staff_role", :"p2_c3_patient_role";

DROP TRIGGER IF EXISTS p2_c3_be_appointments_patient_insert_guard ON public.be_appointments;
CREATE TRIGGER p2_c3_be_appointments_patient_insert_guard
  BEFORE INSERT ON public.be_appointments
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointments();

DROP TRIGGER IF EXISTS p2_c3_be_appointments_patient_update_guard ON public.be_appointments;
CREATE TRIGGER p2_c3_be_appointments_patient_update_guard
  BEFORE UPDATE ON public.be_appointments
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointments();

DROP TRIGGER IF EXISTS p2_c3_be_appointment_reschedules_patient_write_guard ON public.be_appointment_reschedules;
CREATE TRIGGER p2_c3_be_appointment_reschedules_patient_write_guard
  BEFORE INSERT OR UPDATE ON public.be_appointment_reschedules
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointment_reschedules();

DROP TRIGGER IF EXISTS p2_c3_be_appointment_cancellations_patient_write_guard ON public.be_appointment_cancellations;
CREATE TRIGGER p2_c3_be_appointment_cancellations_patient_write_guard
  BEFORE INSERT OR UPDATE ON public.be_appointment_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointment_cancellations();

DROP TRIGGER IF EXISTS p2_c3_be_appointment_events_patient_insert_guard ON public.be_appointment_events;
CREATE TRIGGER p2_c3_be_appointment_events_patient_insert_guard
  BEFORE INSERT ON public.be_appointment_events
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointment_event_insert();

DROP TRIGGER IF EXISTS p2_c3_be_appointment_history_events_patient_insert_guard ON public.be_appointment_history_events;
CREATE TRIGGER p2_c3_be_appointment_history_events_patient_insert_guard
  BEFORE INSERT ON public.be_appointment_history_events
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_be_appointment_event_insert();

DROP TRIGGER IF EXISTS p2_c3_lfk_sessions_patient_write_guard ON public.lfk_sessions;
CREATE TRIGGER p2_c3_lfk_sessions_patient_write_guard
  BEFORE INSERT OR UPDATE ON public.lfk_sessions
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c3_guard_lfk_sessions();

\echo 'P2-C3 patient booking/LFK value guards UP complete.'
