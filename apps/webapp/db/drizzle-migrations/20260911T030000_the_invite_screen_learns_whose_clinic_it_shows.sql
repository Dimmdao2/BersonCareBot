-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT pg_get_function_result(to_regprocedure('app.lookup_patient_invite_continuation(text)')) LIKE '%organization_id uuid%'
--
-- Экран приглашения показывает логотип и имя клиники (владелец 10.09: «он видит логотип терапии,
-- логотип клиники»). Бренд клиники уже приезжает в запрос — поверхность резолвится по хосту
-- (`<slug>.<пациентский хост>` или брендированный домен) и несёт `effectivePatientBrand`. Но брать
-- его на веру нельзя: continuation можно открыть на хосте ЧУЖОЙ клиники, и тогда человек увидел бы
-- приглашение одной клиники под логотипом другой.
--
-- Поэтому дверь начинает возвращать организацию самого приглашения. Страница показывает бренд
-- ТОЛЬКО когда организация хоста совпала с организацией приглашения, иначе остаётся текстовое имя
-- из самого приглашения. Идентификатор не уходит в браузер: сравнение делает серверный компонент.
--
-- Колонка `organization_id` у этой двери уже прочитана и уже объявлена в её `relationSurfaces`,
-- новых прав не появляется. Тип результата меняется, поэтому функция пересоздаётся через DROP.

DROP FUNCTION app.lookup_patient_invite_continuation(text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.lookup_patient_invite_continuation(p_continuation_hash text)
 RETURNS TABLE(ok boolean, code text, organization_title text, recipient_hint text, invite_expires_at timestamp with time zone, organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_organization_title text;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
  v_portal_activated_via text;
  v_hint text;
  v_reopen boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.continuation.lookup', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.lookup_patient_invite_continuation(text)'::regprocedure);
  v_reopen := false;

  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.enrollment_id,
        invite.status, invite.invited_email_normalized, invite.expires_at,
        invite.continuation_expires_at, invite.accepted_by_platform_user_id, invite.accepted_via,
        invite.proof_code_hash, invite.proof_expires_at, invite.proof_verified_at,
        invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.enrollment_id,
      v_invite.status, v_invite.invited_email_normalized, v_invite.expires_at,
      v_invite.continuation_expires_at, v_invite.accepted_by_platform_user_id,
      v_invite.accepted_via, v_invite.proof_code_hash, v_invite.proof_expires_at,
      v_invite.proof_verified_at, v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.recipient_binding = 'unbound_email_claim'
       AND v_invite.invited_email_normalized IS NULL
       AND v_invite.accepted_by_platform_user_id = v_invite.patient_user_id
       AND v_invite.accepted_via = 'email_otp'
       AND v_invite.proof_verified_at IS NOT NULL
       AND v_invite.proof_code_hash IS NOT NULL
       AND v_invite.proof_expires_at IS NOT NULL
       AND v_invite.proof_expires_at > now() THEN
      v_reopen := true;
    ELSE
      RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
      RETURN;
    END IF;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'expired'
     OR v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    IF v_invite.status = 'pending' AND v_invite.expires_at <= now() THEN
      UPDATE public.patient_invites SET status = 'expired', updated_at = now() WHERE id = v_invite.id;
    END IF;
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_enrollment_status, v_portal_activated_at, v_portal_activated_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1;
  IF v_reopen THEN
    IF v_enrollment_status <> 'active'
       OR v_portal_activated_at IS NULL
       OR v_portal_activated_via <> 'patient_invite_email_otp' THEN
      RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
      RETURN;
    END IF;
  ELSIF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT organization.title INTO v_organization_title
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;
  v_hint := CASE
    WHEN v_invite.recipient_binding = 'bound_email'
      AND v_invite.invited_email_normalized IS NOT NULL
      AND position('@' IN v_invite.invited_email_normalized) > 1
      THEN left(v_invite.invited_email_normalized, 1)
        || '***@' || split_part(v_invite.invited_email_normalized, '@', 2)
    ELSE NULL
  END;
  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at,
    v_invite.organization_id;
END
$function$
;
