-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- TEMPORARY LOCAL MIGRATION NUMBER 0053
--
-- Owner ruling 19.08 (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §33.2), verbatim: «Оплаченное место в
-- тарифе описывает пациента — человека, у которого есть визит, программа, общение. Запись на приём сама
-- по себе лимита не расходует и не должна его расходовать… ограничивать его количеством записавшихся это
-- бред». Специалистов ограничивать владелец оставил («специалистов ограничивать — да, это надо»); клиентов
-- по числу публичных записей — нет.
--
-- 0052 (F1) put `app.assert_org_patient_count_quota_available` on BOTH creators of an `org_enrollments`
-- row so a widget booking and the clinic's own reception desk would count against the same ceiling. That
-- was the right fix for the SYMMETRY bug it measured (one creator counted, the other did not), but it
-- carried the ceiling itself onto a path the owner had already ruled against: a visitor who showed up to
-- book an appointment got refused with `53400 saas_quota_reached:patient_count` for a reason that has
-- nothing to do with them — the clinic's paid seat count.
--
-- The fix is narrow: the public door stops spending a seat. It still creates/activates the
-- `org_enrollments` row (a client relationship still exists — the appointment root requires it), it just
-- never asks whether there is room left. The staff card writer keeps asking, unchanged: a card the
-- reception desk opens by hand still spends the clinic's paid place, and that is the behaviour the owner
-- did NOT revoke.
--
-- `app.assert_org_patient_count_quota_available` is left in place, unmodified, and untouched — it is not
-- ITS logic that was wrong, only this door's use of it. After this migration it has exactly one caller
-- again (`ensureInvitedOrganizationClientRelationship`, `infra/repos/pgPatientOrganizationEnrollment.ts`),
-- same as before 0052 introduced the second one. No second copy of the rule is created; there simply
-- stops being a second caller.
CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(
  p_organization_id uuid,
  p_confirmation_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_status text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.public-client.enroll',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_confirmation_channel))::app.port_typed_arg
    ]),
    'app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure
  );

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

  -- Уже выписанный или архивный клиент обратно не открывается: это отказ, а не тихое воскрешение.
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
$function$;

COMMENT ON FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid, text) IS
  'Make the identified public-booking visitor a client of a PUBLISHED clinic. Spends no paid patient_count seat (owner 19.08, OWNER_PRODUCT_RULES.md #33.2) -- only the staff card writer does. The person comes from the accepted patient context, the confirmation channel is an argument checked against the closed list, and the door reports what it did so a failed booking can be compensated.';

REVOKE ALL ON FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid,text) FROM PUBLIC;
