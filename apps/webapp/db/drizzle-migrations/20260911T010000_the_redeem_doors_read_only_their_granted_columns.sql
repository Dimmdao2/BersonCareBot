-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT bool_and(position('invite.*' IN p.prosrc) = 0 AND position('patient.*' IN p.prosrc) = 0) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('redeem_patient_invite_email', 'redeem_patient_invite_session')
--
-- Две двери ПРИНЯТИЯ приглашения читали строку целиком — `SELECT invite.* INTO v_invite`, — а
-- владельцу шва `app_seam_patient_invite_owner` колоночные права выданы ровно на те колонки, которые
-- перечислены в его `relationSurfaces` в `deploy/postgres/privileges/declaration.ts`. Шести колонок
-- (`created_at`, `created_by_platform_user_id`, `delivery_channel_hint`, `superseded_by_invite_id`,
-- `revoked_at`, `revoked_by_platform_user_id`) там нет — двери их не используют. `*` тем не менее
-- требует ВСЕ, поэтому внутри SECURITY DEFINER поднималось `42501 permission denied for table
-- patient_invites`, и принять приглашение было нельзя ни по коду из письма, ни по живой сессии.
-- То же самое со `SELECT patient.* INTO v_patient` по `public.platform_users`.
--
-- Замечено на живом DEV 11.09.2026 при первой сквозной проверке перехода по ссылке; тот же дефект у
-- шести пред-сессионных дверей чинится в
-- `20260911T003000_the_invite_doors_are_pre_session_not_patient.sql`. Здесь двери называют колонки
-- поимённо, список ровно совпадает с уже объявленным — прав никому не добавляется. `%ROWTYPE`
-- сохранён: `INTO` пишет в поля записи, непрочитанные поля остаются NULL, как и раньше.

CREATE OR REPLACE FUNCTION app.redeem_patient_invite_email(p_continuation_hash text)
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
  v_patient_email text;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_authenticated_platform_user_id := app.current_patient_user_id();
  IF v_authenticated_platform_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.enrollment_id,
         invite.status, invite.invited_email_normalized, invite.expires_at,
         invite.continuation_expires_at, invite.proof_email_normalized, invite.proof_verified_at,
         invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.enrollment_id,
       v_invite.status, v_invite.invited_email_normalized, v_invite.expires_at,
       v_invite.continuation_expires_at, v_invite.proof_email_normalized,
       v_invite.proof_verified_at, v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.recipient_binding <> 'bound_email' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid;
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
  IF v_invite.proof_verified_at IS NULL
     OR v_invite.proof_email_normalized IS NULL
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_invite.invited_email_normalized THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT patient.id, patient.role, patient.merged_into_id
  INTO v_patient.id, v_patient.role, v_patient.merged_into_id
  FROM public.platform_users AS patient
  WHERE patient.id = v_authenticated_platform_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT contact.value_normalized INTO v_patient_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_patient.id
    AND contact.contact_kind = 'email'
    AND contact.is_primary = true
  LIMIT 1;
  IF v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL
     OR v_patient_email IS DISTINCT FROM v_invite.invited_email_normalized
     OR v_patient.id <> v_invite.patient_user_id THEN
    IF v_patient.id <> v_invite.patient_user_id THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_patient.id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
        WHERE status = 'pending' DO NOTHING;
    END IF;
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

  UPDATE public.user_contacts AS contact
  SET confirmed_at = COALESCE(contact.confirmed_at, now()), updated_at = now()
  WHERE contact.platform_user_id = v_invite.patient_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = v_invite.invited_email_normalized;
  UPDATE public.org_enrollments AS enrollment
  SET status = 'active', portal_activated_at = now(),
      portal_activated_via = 'patient_invite_email_otp'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.portal_activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_portal_activation_failed';
  END IF;
  UPDATE public.patient_invites AS invite
  SET status = 'accepted', accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'email_otp', accepted_at = now(), updated_at = now(),
      proof_code_hash = NULL, proof_expires_at = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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

  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.enrollment_id,
         invite.status, invite.expires_at, invite.continuation_expires_at
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.enrollment_id,
       v_invite.status, v_invite.expires_at, v_invite.continuation_expires_at
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

  SELECT patient.id, patient.role, patient.merged_into_id
  INTO v_patient.id, v_patient.role, v_patient.merged_into_id
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
