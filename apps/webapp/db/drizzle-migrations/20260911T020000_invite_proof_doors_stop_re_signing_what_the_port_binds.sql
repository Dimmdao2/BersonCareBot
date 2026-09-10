-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.start_patient_invite_email_proof(text,text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('app.verify_patient_invite_email_proof(text,text,text)') IS NOT NULL AND to_regprocedure('app.claim_unbound_patient_invite_email(text,text)') IS NOT NULL AND to_regprocedure('app.start_patient_invite_email_proof(text,text,text,timestamp with time zone,text,bigint,text)') IS NULL
--
-- Три двери подтверждения почты требовали СВОЮ подпись поверх той, которую уже требует порт-контекст:
-- вызывающий передавал nonce, срок и HMAC-SHA256 над каноничной строкой аргументов, а дверь сверяла
-- их с секретом из `app.context_signing_secrets`.
--
-- Этот замок не был закрыт НИ В ОДНОМ окружении и закрыться не мог. На TEST таблица секретов пуста
-- (0 строк) — дверь уходила в ветку `IF NOT FOUND` и отвечала `invalid_invite`. На DEV строка есть,
-- но её значение не совпадает ни с одним секретом, которым подписывает приложение
-- (`env.DB_PRINCIPAL_SIGNING_SECRET || invitePepper()`; в режиме `port-context`
-- `DB_PRINCIPAL_SIGNING_SECRET` не выдаётся вовсе — см. `deploy/host/bootstrap-c4-test-env.mjs`).
-- Таблицу засеивал одноразовый `deploy/postgres/p2-b-protected-principal-context.sql` эпохи режима
-- `locked`; с переходом на `port-context` пара «секрет приложения ↔ секрет базы» разошлась, и весь
-- почтовый путь приглашения молча отвечал «приглашение недействительно». Замер 11.09.2026 на живом
-- TEST и DEV.
--
-- Дверь не остаётся без замка: то же самое — и строже — уже делает пред-сессионный порт-контекст.
-- `app.require_accepted_context(...)` первым оператором сверяет владельца шва, целевую роль, класс
-- контекста, назначение, точную сигнатуру функции И `app.hash_port_typed_args` — хеш ТОЧНЫХ
-- аргументов, которые вызывающий объявил, открывая контекст (`runWebappNamedRoot` →
-- `withPortContextTransaction`). Открыть контекст можно только с идентификатором возможности из
-- каталога окружения, а повтор ловит журнал nonce. Прежний HMAC связывал ровно то, что уже связано,
-- и вдобавок требовал второй общий секрет — лишний замок на той же двери.
--
-- Поэтому три аргумента авторизации уходят из сигнатур, а `app.context_signing_secrets` перестаёт
-- быть зависимостью этих дверей: после этой миграции её не читает никто.

DROP FUNCTION app.start_patient_invite_email_proof(text,text,text,timestamp with time zone,text,bigint,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.start_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_proof_expires_at timestamp with time zone)
 RETURNS TABLE(ok boolean, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.email-proof.start', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg]), 'app.start_patient_invite_email_proof(text,text,text,timestamp with time zone)'::regprocedure);
  v_email := lower(btrim(p_email_normalized));

  SELECT invite.id, invite.organization_id, invite.status, invite.invited_email_normalized,
        invite.expires_at, invite.continuation_expires_at, invite.proof_started_at,
        invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.status, v_invite.invited_email_normalized,
      v_invite.expires_at, v_invite.continuation_expires_at, v_invite.proof_started_at,
      v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_invite.status <> 'pending'
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now()
     OR v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text;
    RETURN;
  END IF;
  IF v_email = '' OR position('@' IN v_email) <= 1
     OR p_code_hash IS NULL OR p_code_hash = ''
     OR p_proof_expires_at IS NULL OR p_proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  IF v_invite.recipient_binding = 'bound_email'
     AND v_invite.invited_email_normalized IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text;
    RETURN;
  ELSIF v_invite.recipient_binding NOT IN ('bound_email', 'unbound_email_claim') THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  IF v_invite.proof_started_at IS NOT NULL
     AND v_invite.proof_started_at > now() - interval '30 seconds' THEN
    RETURN QUERY SELECT false, 'rate_limited'::text;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET proof_email_normalized = v_email,
      proof_code_hash = p_code_hash,
      proof_started_at = now(),
      proof_expires_at = LEAST(p_proof_expires_at, v_invite.continuation_expires_at, v_invite.expires_at),
      proof_attempts = 0,
      proof_verified_at = NULL,
      updated_at = now()
  WHERE invite.id = v_invite.id;
  RETURN QUERY SELECT true, NULL::text;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
DROP FUNCTION app.verify_patient_invite_email_proof(text,text,text,text,bigint,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.verify_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text)
 RETURNS TABLE(ok boolean, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.email-proof.verify', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.verify_patient_invite_email_proof(text,text,text)'::regprocedure);
  v_email := lower(btrim(p_email_normalized));

  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.status,
        invite.invited_email_normalized, invite.expires_at, invite.continuation_expires_at,
        invite.accepted_by_platform_user_id, invite.accepted_via, invite.proof_attempts,
        invite.proof_code_hash, invite.proof_email_normalized, invite.proof_expires_at,
        invite.proof_verified_at, invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.status,
      v_invite.invited_email_normalized, v_invite.expires_at, v_invite.continuation_expires_at,
      v_invite.accepted_by_platform_user_id, v_invite.accepted_via, v_invite.proof_attempts,
      v_invite.proof_code_hash, v_invite.proof_email_normalized, v_invite.proof_expires_at,
      v_invite.proof_verified_at, v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now()
     OR v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.recipient_binding = 'unbound_email_claim'
       AND v_invite.invited_email_normalized IS NULL
       AND v_invite.accepted_by_platform_user_id = v_invite.patient_user_id
       AND v_invite.accepted_via = 'email_otp'
       AND v_invite.proof_verified_at IS NOT NULL
       AND v_invite.proof_email_normalized = v_email
       AND v_invite.proof_code_hash = p_code_hash
       AND v_invite.proof_expires_at IS NOT NULL
       AND v_invite.proof_expires_at > now() THEN
      RETURN QUERY SELECT true, NULL::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_verified_at IS NOT NULL
     AND v_invite.proof_email_normalized = v_email THEN
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;
  IF v_invite.proof_email_normalized IS DISTINCT FROM v_email
     OR (v_invite.recipient_binding = 'bound_email'
         AND v_invite.invited_email_normalized IS DISTINCT FROM v_email)
     OR v_invite.recipient_binding NOT IN ('bound_email', 'unbound_email_claim')
     OR v_invite.proof_code_hash IS NULL
     OR v_invite.proof_expires_at IS NULL THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_attempts >= 5 THEN
    RETURN QUERY SELECT false, 'too_many_attempts'::text;
    RETURN;
  END IF;
  IF v_invite.proof_code_hash <> p_code_hash THEN
    UPDATE public.patient_invites AS invite
    SET proof_attempts = proof_attempts + 1, updated_at = now()
    WHERE invite.id = v_invite.id;
    RETURN QUERY SELECT false,
      CASE WHEN v_invite.proof_attempts + 1 >= 5 THEN 'too_many_attempts'::text ELSE 'invalid_code'::text END;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET proof_verified_at = now(), updated_at = now()
  WHERE invite.id = v_invite.id;
  RETURN QUERY SELECT true, NULL::text;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
DROP FUNCTION app.claim_unbound_patient_invite_email(text,text,text,bigint,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text)
 RETURNS TABLE(ok boolean, code text, organization_id uuid, patient_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_email_owner_id uuid;
  v_patient_email text;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
  v_portal_activated_via text;
  v_reopen boolean;
  v_email text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.unbound-email.claim', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.claim_unbound_patient_invite_email(text,text)'::regprocedure);
  v_reopen := false;
  v_email := lower(btrim(p_email_normalized));

  IF v_email = '' OR position('@' IN v_email) <= 1 THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.enrollment_id,
        invite.status, invite.invited_email_normalized, invite.expires_at,
        invite.continuation_expires_at, invite.accepted_by_platform_user_id, invite.accepted_via,
        invite.proof_code_hash, invite.proof_email_normalized, invite.proof_expires_at,
        invite.proof_verified_at, invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.enrollment_id,
      v_invite.status, v_invite.invited_email_normalized, v_invite.expires_at,
      v_invite.continuation_expires_at, v_invite.accepted_by_platform_user_id,
      v_invite.accepted_via, v_invite.proof_code_hash, v_invite.proof_email_normalized,
      v_invite.proof_expires_at, v_invite.proof_verified_at, v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.recipient_binding <> 'unbound_email_claim'
     OR v_invite.invited_email_normalized IS NOT NULL THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.accepted_by_platform_user_id IS DISTINCT FROM v_invite.patient_user_id
       OR v_invite.accepted_via IS DISTINCT FROM 'email_otp' THEN
      RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
    v_reopen := true;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    UPDATE public.patient_invites SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id AND expires_at <= now();
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.proof_verified_at IS NULL
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_email
     OR v_invite.proof_code_hash IS NULL
     OR v_invite.proof_expires_at IS NULL
     OR v_invite.proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  SELECT patient.id, patient.role, patient.merged_into_id
  INTO v_patient.id, v_patient.role, v_patient.merged_into_id
  FROM public.platform_users AS patient
  WHERE patient.id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  SELECT contact.value_normalized INTO v_patient_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_patient.id
    AND contact.contact_kind = 'email'
    AND contact.is_primary = true
  LIMIT 1;
  IF v_patient_email IS NOT NULL AND v_patient_email <> v_email THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT contact.platform_user_id INTO v_email_owner_id
  FROM public.user_contacts AS contact
  JOIN public.platform_users AS patient ON patient.id = contact.platform_user_id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = v_email
    AND patient.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE;
  IF FOUND AND v_email_owner_id <> v_invite.patient_user_id THEN
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
      'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
    ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
      WHERE status = 'pending' DO NOTHING;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_enrollment_status, v_portal_activated_at, v_portal_activated_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_reopen THEN
    IF v_enrollment_status = 'active'
       AND v_portal_activated_at IS NOT NULL
       AND v_portal_activated_via = 'patient_invite_email_otp' THEN
      RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary,
      confirmed_at, source_origin, updated_at
    ) VALUES (
      v_invite.patient_user_id, 'email', v_email, true,
      now(), 'direct', now()
    )
    ON CONFLICT (value_normalized) WHERE contact_kind = 'email'
    DO UPDATE SET
      is_primary = true,
      confirmed_at = COALESCE(user_contacts.confirmed_at, EXCLUDED.confirmed_at),
      updated_at = now();
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT contact.platform_user_id INTO v_email_owner_id
    FROM public.user_contacts AS contact
    JOIN public.platform_users AS patient ON patient.id = contact.platform_user_id
    WHERE contact.contact_kind = 'email'
      AND contact.value_normalized = v_email
      AND patient.merged_into_id IS NULL
    LIMIT 1
    FOR UPDATE;
    IF FOUND AND v_email_owner_id <> v_invite.patient_user_id THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
        WHERE status = 'pending' DO NOTHING;
    END IF;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END;

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
      accepted_via = 'email_otp', accepted_at = now(), updated_at = now()
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id;
END
$function$
;
