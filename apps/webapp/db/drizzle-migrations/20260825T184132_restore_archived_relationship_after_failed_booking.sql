-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.enroll_current_patient_in_public_booking_clinic(uuid,text)
-- A failed attempt must restore an archived clinic relationship even when the patient has old
-- appointments. The DB-issued attempt timestamp lets compensation distinguish that history from
-- an appointment created concurrently after reactivation.
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.revoke_public_booking_enrollment(uuid,text)') IS NULL AND to_regprocedure('app.revoke_public_booking_enrollment(uuid,text,timestamp with time zone)') IS NOT NULL AND pg_catalog.pg_get_functiondef('app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure) LIKE '%attemptStartedAt%' AND pg_catalog.pg_get_functiondef('app.revoke_public_booking_enrollment(uuid,text,timestamp with time zone)'::regprocedure) LIKE '%created_at >= p_attempt_started_at%'
CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(p_organization_id uuid, p_confirmation_channel text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_status text;
  v_attempt_started_at timestamptz := clock_timestamp();
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.public-client.enroll', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure);

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  IF p_confirmation_channel IS NULL
     OR p_confirmation_channel NOT IN (
       'public_booking_phone_otp',
       'public_booking_verified_email',
       'public_booking_session'
     ) THEN
    RAISE EXCEPTION 'public booking confirmation channel is not a confirmed contact channel'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries AS directory
    WHERE directory.organization_id = p_organization_id
      AND directory.is_published = true
  ) THEN
    RAISE EXCEPTION 'public booking clinic is not published' USING ERRCODE = '42501';
  END IF;

  SELECT enrollment.status
  INTO v_status
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient
  FOR UPDATE;

  IF v_status IS NULL THEN
    INSERT INTO public.org_enrollments (
      organization_id, platform_user_id, status, portal_activated_at, portal_activated_via
    )
    VALUES (p_organization_id, v_patient, 'active', now(), p_confirmation_channel)
    ON CONFLICT (organization_id, platform_user_id) DO NOTHING;

    SELECT enrollment.status
    INTO v_status
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;

    IF v_status IS NULL OR v_status NOT IN ('invited', 'active') THEN
      RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'status', v_status,
      'effect', 'created',
      'attemptStartedAt', v_attempt_started_at
    );
  END IF;

  IF v_status = 'archived' THEN
    UPDATE public.org_enrollments AS enrollment
    SET status = 'active'
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object(
      'status', 'active',
      'effect', 'reactivated',
      'attemptStartedAt', v_attempt_started_at
    );
  END IF;

  IF v_status NOT IN ('invited', 'active') THEN
    RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'invited' THEN
    UPDATE public.org_enrollments AS enrollment
    SET status = 'active',
        portal_activated_at = COALESCE(enrollment.portal_activated_at, now()),
        portal_activated_via = COALESCE(enrollment.portal_activated_via, p_confirmation_channel)
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object(
      'status', 'active',
      'effect', 'activated',
      'attemptStartedAt', v_attempt_started_at
    );
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'effect', 'unchanged',
    'attemptStartedAt', v_attempt_started_at
  );
END;
$_$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
DROP FUNCTION app.revoke_public_booking_enrollment(uuid, text);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.revoke_public_booking_enrollment(
  p_organization_id uuid,
  p_enrollment_effect text,
  p_attempt_started_at timestamptz
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_created_at timestamptz;
  v_portal_at timestamptz;
  v_portal_via text;
  v_status text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.public-client.revoke', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($3))::app.port_typed_arg]), 'app.revoke_public_booking_enrollment(uuid,text,timestamp with time zone)'::regprocedure);

  IF v_patient IS NULL OR p_organization_id IS NULL OR p_attempt_started_at IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT enrollment.status, enrollment.created_at,
         enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_status, v_created_at, v_portal_at, v_portal_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('effect', 'absent');
  END IF;

  IF p_enrollment_effect = 'reactivated' THEN
    IF v_status <> 'active' OR EXISTS (
      SELECT 1 FROM public.be_appointments AS appointment
      WHERE appointment.organization_id = p_organization_id
        AND appointment.platform_user_id = v_patient
        AND appointment.created_at >= p_attempt_started_at
        AND appointment.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object('effect', 'kept');
    END IF;

    UPDATE public.org_enrollments AS enrollment
    SET status = 'archived'
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object('effect', 'reverted');
  END IF;

  IF p_enrollment_effect NOT IN ('created', 'activated') THEN
    RETURN jsonb_build_object('effect', 'kept');
  END IF;

  IF v_portal_via IS NULL
     OR v_portal_via NOT IN (
       'public_booking_phone_otp',
       'public_booking_verified_email',
       'public_booking_session'
     )
     OR v_portal_at IS NULL
     OR v_portal_at < now() - '00:15:00'::interval THEN
    RETURN jsonb_build_object('effect', 'kept');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.be_appointments AS appointment
    WHERE appointment.organization_id = p_organization_id
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('effect', 'kept');
  END IF;

  IF v_created_at = v_portal_at THEN
    DELETE FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object('effect', 'deleted');
  END IF;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'invited',
      portal_activated_at = NULL,
      portal_activated_via = NULL
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient;
  RETURN jsonb_build_object('effect', 'reverted');
END;
$_$;
