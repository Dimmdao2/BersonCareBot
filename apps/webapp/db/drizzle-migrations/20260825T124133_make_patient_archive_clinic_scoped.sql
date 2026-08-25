-- BCB-MIGRATION-BACKFILL
-- A clinic archive is relationship state, not account state. Existing globally archived clients
-- are converted to archived clinic enrollments, then the obsolete global flag is cleared. A real
-- new appointment reactivates that clinic relationship; failed public booking restores it exactly.
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.revoke_public_booking_enrollment(uuid)') IS NULL AND to_regprocedure('app.revoke_public_booking_enrollment(uuid,text)') IS NOT NULL AND pg_catalog.pg_get_functiondef('app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure) LIKE '%effect'', ''reactivated%' AND NOT EXISTS (SELECT 1 FROM public.platform_users WHERE role = 'client' AND is_archived = true)
UPDATE public.org_enrollments AS enrollment
SET status = 'archived'
FROM public.platform_users AS platform_user
WHERE platform_user.id = enrollment.platform_user_id
  AND platform_user.role = 'client'
  AND platform_user.is_archived = true
  AND enrollment.status <> 'archived';

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
UPDATE public.platform_users
SET is_archived = false,
    updated_at = now()
WHERE role = 'client'
  AND is_archived = true;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.enroll_current_patient_in_public_booking_clinic(uuid,text)
CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(p_organization_id uuid, p_confirmation_channel text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_status text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.public-client.enroll', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure);

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  -- Канал проверяет сама дверь: вызывающий его называет, но дверь ему не верит.
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
    -- Владелец 19.08 (§33.2): запись сама по себе не расходует оплаченное число клиентов. Единственная
    -- проверка (`app.assert_org_patient_count_quota_available`) остаётся у писателя карточек персонала —
    -- эта дверь её больше не зовёт.
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
    RETURN jsonb_build_object('status', v_status, 'effect', 'created');
  END IF;

  -- Новая запись возвращает пациента из архива этой клиники. Это меняет только отношение с
  -- текущей клиникой; вход, другие клиники, карта и переписка остаются самостоятельными.
  IF v_status = 'archived' THEN
    UPDATE public.org_enrollments AS enrollment
    SET status = 'active'
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object('status', 'active', 'effect', 'reactivated');
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
    RETURN jsonb_build_object('status', 'active', 'effect', 'activated');
  END IF;

  RETURN jsonb_build_object('status', v_status, 'effect', 'unchanged');
END;
$_$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
DROP FUNCTION app.revoke_public_booking_enrollment(uuid);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.revoke_public_booking_enrollment(p_organization_id uuid, p_enrollment_effect text) RETURNS jsonb
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
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.public-client.revoke', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.revoke_public_booking_enrollment(uuid,text)'::regprocedure);

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
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
