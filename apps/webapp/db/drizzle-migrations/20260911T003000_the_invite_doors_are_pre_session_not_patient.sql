-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%app_pre_session%') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('exchange_patient_invite', 'lookup_patient_invite_continuation', 'start_patient_invite_email_proof', 'verify_patient_invite_email_proof', 'cancel_patient_invite_email_proof', 'claim_unbound_patient_invite_email')
--
-- Шесть дверей приглашения объявлены пациентскими, а зовут их ДО того, как пациент появился.
--
-- Замер 11.09.2026 на живом DEV и TEST: `POST /api/join/exchange` отвечает 500 «Missing declared
-- webapp port capability: pre_session» на самом первом шаге. Причина структурная, а не в данных:
-- переход по ссылке приглашения происходит без сессии, маршрут ставит bootstrap-принципал, а
-- bootstrap в порт-контексте берёт ТОЛЬКО capability класса `pre_session` — у которой целевая роль
-- обязана быть `app_pre_session`. Эти же функции гейтились на `app_patient`. То есть принять
-- приглашение было нельзя вообще: ни по коду из письма, ни как-либо ещё. Владелец видел это как
-- «ссылка не работает».
--
-- Здесь у шести ПРЕД-СЕССИОННЫХ дверей меняется роль, для которой они аттестованы, и форма самой
-- аттестации: пред-сессионные двери кластер принимает только в точном виде
-- `PERFORM app.require_accepted_context(владелец, роль, класс, назначение, хеш аргументов, сигнатура)`
-- первым оператором после `BEGIN` (гейт собирается в `preSessionGateVerifierLines`,
-- `deploy/postgres/privileges/generate.mjs`). Поэтому же инициализаторы переменных уехали из `DECLARE`
-- в тело: то, что стоит до аттестации, до аттестации и выполняется.
--
-- Вторая правка тех же тел — своя, отдельная поломка, вскрытая на живом DEV сразу после первой:
-- `SELECT invite.* INTO v_invite` читает ВСЕ колонки таблицы, а владельцу шва
-- `app_seam_patient_invite_owner` выданы колоночные права ровно на те колонки, которые перечислены в
-- его `relationSurfaces`. Шести колонок (`created_at`, `created_by_platform_user_id`,
-- `delivery_channel_hint`, `superseded_by_invite_id`, `revoked_at`, `revoked_by_platform_user_id`)
-- там нет и быть не должно — двери их не используют. Итог: `42501 permission denied for table
-- patient_invites` внутри SECURITY DEFINER. Двери теперь называют колонки поимённо, и список ровно
-- совпадает с тем, что уже объявлено; прав никому не добавляется. Прежнее `%ROWTYPE` сохранено:
-- `INTO` пишет в поля записи, поэтому непрочитанные поля остаются NULL, как и раньше. Двери принятия (`redeem_patient_invite_email`,
-- `redeem_patient_invite_session`) остаются на `app_patient`: их зовут, когда человек уже вошёл, и
-- там принципал действительно пациентский.
--
-- Смежное: EXECUTE переезжает с `app_patient` на `app_pre_session` в
-- `deploy/postgres/privileges/declaration.ts` (в миграциях грантов нет), там же заводятся сами
-- capability-строки. План — `docs/_TODO/PATIENT_INVITE_LINK_2026-09-10.md`, этап 2.2.
CREATE OR REPLACE FUNCTION app.exchange_patient_invite(p_token_hash text, p_continuation_hash text, p_continuation_expires_at timestamp with time zone)
 RETURNS TABLE(ok boolean, code text, organization_title text, recipient_hint text, invite_expires_at timestamp with time zone)
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
  v_hint text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.bearer.exchange', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($3))::app.port_typed_arg]), 'app.exchange_patient_invite(text,text,timestamp with time zone)'::regprocedure);

  IF p_token_hash IS NULL OR p_token_hash = ''
     OR p_continuation_hash IS NULL OR p_continuation_hash = ''
     OR p_continuation_expires_at IS NULL OR p_continuation_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT invite.id, invite.organization_id, invite.patient_user_id, invite.enrollment_id,
        invite.status, invite.invited_email_normalized, invite.expires_at,
        invite.bearer_exchanged_at, invite.recipient_binding
  INTO v_invite.id, v_invite.organization_id, v_invite.patient_user_id, v_invite.enrollment_id,
      v_invite.status, v_invite.invited_email_normalized, v_invite.expires_at,
      v_invite.bearer_exchanged_at, v_invite.recipient_binding
  FROM public.patient_invites AS invite
  WHERE invite.token_hash = p_token_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'expired' OR v_invite.expires_at <= now() THEN
    UPDATE public.patient_invites AS invite
    SET status = 'expired', updated_at = now()
    WHERE invite.id = v_invite.id AND invite.status = 'pending';
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.bearer_exchanged_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'exchanged_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at
  INTO v_enrollment_status, v_portal_activated_at
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1;
  IF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT organization.title INTO v_organization_title
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_invite.recipient_binding = 'bound_email' THEN
    IF v_invite.invited_email_normalized IS NULL
       OR position('@' IN v_invite.invited_email_normalized) <= 1 THEN
      RETURN QUERY SELECT false, 'missing_recipient'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    v_hint := left(v_invite.invited_email_normalized, 1)
      || '***@' || split_part(v_invite.invited_email_normalized, '@', 2);
  ELSIF v_invite.recipient_binding = 'unbound_email_claim' THEN
    v_hint := NULL;
  ELSE
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET bearer_exchanged_at = now(),
      continuation_hash = p_continuation_hash,
      continuation_expires_at = LEAST(p_continuation_expires_at, v_invite.expires_at),
      updated_at = now()
  WHERE invite.id = v_invite.id
    AND invite.status = 'pending'
    AND invite.bearer_exchanged_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'exchanged_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.lookup_patient_invite_continuation(p_continuation_hash text)
 RETURNS TABLE(ok boolean, code text, organization_title text, recipient_hint text, invite_expires_at timestamp with time zone)
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
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::text, NULL::text, NULL::timestamptz;
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
      RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'expired'
     OR v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    IF v_invite.status = 'pending' AND v_invite.expires_at <= now() THEN
      UPDATE public.patient_invites SET status = 'expired', updated_at = now() WHERE id = v_invite.id;
    END IF;
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz;
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
      RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  ELSIF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT organization.title INTO v_organization_title
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
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
  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.start_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_proof_expires_at timestamp with time zone, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)
 RETURNS TABLE(ok boolean, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text;
  v_secret text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.email-proof.start', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg]), 'app.start_patient_invite_email_proof(text,text,text,timestamp with time zone,text,bigint,text)'::regprocedure);
  v_email := lower(btrim(p_email_normalized));
  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;

  IF p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'start', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, p_code_hash,
    COALESCE(floor(extract(epoch FROM p_proof_expires_at))::bigint::text, '')
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
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
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.verify_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)
 RETURNS TABLE(ok boolean, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text;
  v_secret text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.email-proof.verify', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg]), 'app.verify_patient_invite_email_proof(text,text,text,text,bigint,text)'::regprocedure);
  v_email := lower(btrim(p_email_normalized));
  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;

  IF p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'verify', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, p_code_hash, ''
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
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
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Дверь была LANGUAGE sql, и это единственная причина, по которой её тело здесь переписано целиком:
-- пред-сессионный гейт кластера требует, чтобы первым оператором ПОСЛЕ `BEGIN` стоял именно
-- `PERFORM app.require_accepted_context(...)` (см. `preSessionGateVerifierLines` в
-- `deploy/postgres/privileges/generate.mjs`). У sql-функции блока `BEGIN` нет вовсе, поэтому проверку
-- нечем предъявить. Смысл прежний дословно: снять начатое подтверждение почты, если код совпал и оно
-- ещё не подтверждено. Единственное различие — «ничего не отменилось» теперь `false`, а не NULL;
-- вызывающий и раньше сравнивал результат строго с `true`.
CREATE OR REPLACE FUNCTION app.cancel_patient_invite_email_proof(p_continuation_hash text, p_code_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.email-proof.cancel', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.cancel_patient_invite_email_proof(text,text)'::regprocedure);

  UPDATE public.patient_invites AS invite
  SET proof_email_normalized = NULL,
      proof_code_hash = NULL,
      proof_started_at = NULL,
      proof_expires_at = NULL,
      proof_attempts = 0,
      proof_verified_at = NULL,
      updated_at = now()
  WHERE invite.continuation_hash = p_continuation_hash
    AND invite.status = 'pending'
    AND invite.proof_code_hash = p_code_hash
    AND invite.proof_verified_at IS NULL;
  RETURN FOUND;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)
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
  v_secret text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_invite_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-invite.unbound-email.claim', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg]), 'app.claim_unbound_patient_invite_email(text,text,text,bigint,text)'::regprocedure);
  v_reopen := false;
  v_email := lower(btrim(p_email_normalized));
  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;

  IF v_email = '' OR position('@' IN v_email) <= 1
     OR p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'claim', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, '', ''
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
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
