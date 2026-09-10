-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_get_constraintdef(oid) LIKE '%patient_invite_session%' FROM pg_constraint WHERE conrelid = 'public.org_enrollments'::regclass AND conname = 'org_enrollments_portal_activation_check'
--
-- Владелец 10.09.2026, дословно: «если он уже залогинен, то у него открывается его кабинет сразу в
-- эту клинику». Сегодня приглашение принимается ТОЛЬКО против кода из письма
-- (`app.redeem_patient_invite_email` жёстко требует `proof_verified_at`), поэтому вошедшему
-- человеку всё равно показывают экран «введите имейл» — то есть просят доказать то, что уже
-- доказано сессией.
--
-- Здесь готовятся два справочных значения: приглашение, принятое по сессии, называется своим именем
-- (`accepted_via = 'session'`, `portal_activated_via = 'patient_invite_session'`), а не маскируется
-- под `email_otp`. Иначе журнал активации врёт: по нему нельзя отличить человека, подтвердившего
-- почту, от человека, вошедшего по уже живой сессии. У активации кабинета уже есть ровно такая пара
-- значений для публичной брони (`public_booking_verified_email` против `public_booking_session`) —
-- эта запись продолжает то же различие.
ALTER TABLE public.patient_invites
  DROP CONSTRAINT patient_invites_accepted_via_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.patient_invites
  ADD CONSTRAINT patient_invites_accepted_via_check
  CHECK (accepted_via IS NULL OR accepted_via IN ('email_otp', 'session'));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.org_enrollments
  DROP CONSTRAINT org_enrollments_portal_activation_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.org_enrollments
  ADD CONSTRAINT org_enrollments_portal_activation_check
  CHECK (
    (portal_activated_at IS NULL AND portal_activated_via IS NULL)
    OR (
      portal_activated_at IS NOT NULL
      AND portal_activated_via IN (
        'patient_invite_email_otp',
        'patient_invite_session',
        'public_booking_phone_otp',
        'public_booking_verified_email',
        'public_booking_session'
      )
    )
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Приглашение, открытое ТЕМ ЖЕ человеком, кому оно выписано: сессия и есть доказательство.
--
-- Единственное, чем эта дверь отличается от `app.redeem_patient_invite_email`, — чем доказана
-- личность. Там это код из письма на адрес приглашения; здесь — живая сессия, и принимается она
-- ТОЛЬКО когда вошедший совпадает с `patient_user_id` самого приглашения. Совпадения по почте
-- недостаточно и оно тут не проверяется вовсе: приглашение выписано на конкретную запись пациента,
-- и «привязать» к ней вошедшего с другим идентификатором — это молчаливое слияние двух разных
-- людей. Такой случай возвращает `unproved_identity`, вызывающий откатывается на почтовый путь, а
-- пара идентификаторов, как и в почтовой двери, кладётся в `patient_merge_candidates` — решать
-- слияние людям, а не этой функции.
--
-- Все прочие проверки жизненного цикла (организация активна, приглашение `pending` и не истекло,
-- continuation жив, кабинет ещё не активирован, отношение с клиникой действующее) повторены
-- дословно: приглашение не должно приниматься по сессии в тех состояниях, в которых оно не
-- принимается по почте.
CREATE OR REPLACE FUNCTION app.redeem_patient_invite_session(p_continuation_hash text)
 RETURNS TABLE(ok boolean, code text, organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_authenticated_platform_user_id uuid;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_authenticated_platform_user_id := app.current_patient_user_id();
  IF v_authenticated_platform_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    UPDATE public.patient_invites SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id AND expires_at <= now();
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Вошёл не тот человек. Не отказ в доступе, а отсутствие доказательства ИМЕННО ЭТОГО
  -- приглашения: вызывающий показывает почтовый экран, где личность доказывается заново.
  IF v_authenticated_platform_user_id <> v_invite.patient_user_id THEN
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      v_invite.organization_id, v_invite.patient_user_id, v_authenticated_platform_user_id,
      'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
    ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
      WHERE status = 'pending' DO NOTHING;
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT patient.* INTO v_patient
  FROM public.platform_users AS patient
  WHERE patient.id = v_authenticated_platform_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at
  INTO v_enrollment_status, v_portal_activated_at
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'active', portal_activated_at = now(),
      portal_activated_via = 'patient_invite_session'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.portal_activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_portal_activation_failed';
  END IF;

  UPDATE public.patient_invites AS invite
  SET status = 'accepted', accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'session', accepted_at = now(), updated_at = now(),
      proof_code_hash = NULL, proof_expires_at = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id;
END
$function$
;
