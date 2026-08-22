-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY['app.email_auth_delete_email_challenges_for_user(uuid)','app.email_auth_find_email_challenge_for_confirm(uuid,uuid)','app.email_auth_find_email_owner_conflict(uuid,text)','app.email_auth_increment_email_challenge_attempts(uuid)','app.email_auth_verify_user_email(uuid,text)','app.email_password_delete_unverified_registration(uuid)','app.email_password_find_login_candidate(text)','app.email_password_find_user_id_by_email_challenge(uuid)','app.email_password_register_pending(text,text,text,text,text,text)','app.get_specialist_signup_intent_by_challenge(uuid)']) AS wanted(signature) JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(wanted.signature) JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE l.lanname <> 'plpgsql' OR pg_catalog.strpos(p.prosrc, 'require_attested_context_for_roles') > 0 OR pg_catalog.substr(p.prosrc, pg_catalog.strpos(pg_catalog.upper(p.prosrc), 'BEGIN')) !~* '^BEGIN[[:space:]]+PERFORM[[:space:]]+app[.]require_accepted_context[[:space:]]*[(]');
--
-- D15b/6 (owner blocker, 22.08.2026): `wt/signup-pre-session-20260822` moved the registration and
-- login roots into the `pre_session` capability class in `deploy/postgres/privileges/declaration.ts`,
-- but their bodies in the database still carried the older
-- `app.require_attested_context_for_roles(<owner>, ARRAY['app_patient'])` gate. The declaration and
-- the catalog therefore disagreed and `bash deploy/host/migrate-dev.sh --execute` died on reconcile:
--   ERROR: pre-session exact gate missing or mismatched:
--          app.email_auth_delete_email_challenges_for_user(uuid)
-- DEV could not be reconciled and TEST could not be deployed while that stood.
--
-- The exact pre-session gate that reconcile verifies
-- (`generatePreSessionGateVerifierSql`, deploy/postgres/privileges/generate.mjs) demands a shape,
-- not merely a call: the body must be PL/pgSQL, its first `BEGIN` must be followed immediately by
-- `PERFORM app.require_accepted_context(...)`, that call must carry `app.hash_port_typed_args(...)`,
-- the function's own `::regprocedure` identity and the declared purpose, and nothing before the gate
-- may assign (`:=` / `DEFAULT`) — an early assignment would run on the caller's arguments before the
-- context was proven. Eight of these ten roots were `LANGUAGE sql`, where no such first statement
-- can exist, so this migration rewrites them as PL/pgSQL. Everything else is preserved exactly as it
-- stands in `pg_proc` on the named DEV database today: owner, signature, argument names and types,
-- return type, volatility, `SECURITY DEFINER`, `SET search_path TO 'pg_catalog'` and the statement
-- text — including the update-then-insert shape `20260822T090000` gave
-- `app.email_auth_verify_user_email(uuid,text)` so that a foreign confirmed e-mail meets
-- `uq_user_contacts_email` and is refused `23505` instead of being silently re-stamped.
-- `CREATE OR REPLACE` keeps every OID, so `function_identity` (`regprocedure`), the declared
-- capabilities and every callsite address the same objects.
--
-- Two of the ten were already PL/pgSQL and change less. `app.email_password_register_pending(...)`
-- additionally moves its four `DECLARE` initialisers (`v_email_norm`, `v_last_name`, `v_first_name`,
-- `v_patronymic`) below the gate: `DECLARE v_email_norm text := lower(btrim($1))` is exactly the
-- pre-gate assignment the verifier refuses, and the values are identical either way.
--
-- The gate text of each root is byte-identical to the expression the generator renders for it in
-- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, so the reconcile step that owns these
-- gate expressions finds nothing to rewrite.
--
-- An eleventh root of the same login path, `app.find_platform_user_ids_by_any_confirmed_email(text)`,
-- is deliberately NOT touched here. It is not directly executable by `app_pre_session` — it is a
-- delegate of two of the doors above (`delegatesTo` in the declaration), so it keeps the attested
-- gate class, and the generator widens its allowed target roles to
-- `ARRAY['app_patient','app_pre_session']` and rewrites that one expression in place on every
-- reconcile. Writing it into a migration would create the second source of truth that §1 forbids.
--
-- No GRANT/REVOKE/POLICY here (AGENTS.md §1). No relation, column, row lock, `FOR UPDATE`/`FOR SHARE`
-- or seam role appears or disappears: every statement body is carried over verbatim, so the declared
-- relation surfaces and `ROW_LOCK_SURFACES` are unchanged and nothing new needs declaring.
CREATE OR REPLACE FUNCTION app.email_auth_delete_email_challenges_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.delete-for-user', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_auth_delete_email_challenges_for_user(uuid)'::regprocedure);

  DELETE FROM public.email_challenges WHERE user_id = p_user_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_auth_find_email_challenge_for_confirm(p_challenge_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.find-for-confirm', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg]), 'app.email_auth_find_email_challenge_for_confirm(uuid,uuid)'::regprocedure);

  RETURN QUERY
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.email.owner-conflict', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.email_auth_find_email_owner_conflict(uuid,text)'::regprocedure);

  RETURN EXISTS (
    SELECT 1
    FROM app.find_platform_user_ids_by_any_confirmed_email(p_email) AS fpu
    WHERE fpu.user_id <> p_user_id
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_auth_increment_email_challenge_attempts(p_challenge_id uuid)
 RETURNS TABLE(attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.increment-attempts', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_auth_increment_email_challenge_attempts(uuid)'::regprocedure);

  PERFORM 1 FROM public.email_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.email_challenges
  SET attempts = attempts + 1
  WHERE id = p_challenge_id
  RETURNING public.email_challenges.attempts::integer;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.email.verify', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.email_auth_verify_user_email(uuid,text)'::regprocedure);

  WITH confirmed_own_contact AS (
    UPDATE public.user_contacts
    SET is_primary = true,
        confirmed_at = now(),
        updated_at = now()
    WHERE platform_user_id = p_user_id
      AND contact_kind = 'email'
      AND value_normalized = lower(btrim(p_email))
    RETURNING 1
  )
  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary,
    confirmed_at, source_origin, updated_at
  )
  SELECT p_user_id, 'email', lower(btrim(p_email)), true, now(), 'direct', now()
  WHERE NOT EXISTS (SELECT 1 FROM confirmed_own_contact);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.delete-unverified', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_password_delete_unverified_registration(uuid)'::regprocedure);

  DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role IN ('client', 'doctor')
    AND merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = p_user_id
        AND contact.contact_kind = 'email'
        AND contact.confirmed_at IS NOT NULL
    );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)
 RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.resend-candidate', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_password_find_login_candidate(text)'::regprocedure);

  RETURN QUERY
  SELECT upc.user_id, upc.password_hash,
         (matched_email.confirmed_at IS NOT NULL OR fpu.matched_primary = false) AS email_verified
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS fpu ON fpu.user_id = upc.user_id
  LEFT JOIN public.user_contacts AS matched_email
    ON matched_email.platform_user_id = pu.id
   AND matched_email.contact_kind = 'email'
   AND matched_email.value_normalized = lower(btrim(p_email_norm))
  WHERE pu.merged_into_id IS NULL
  LIMIT 1;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.challenge-owner', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_password_find_user_id_by_email_challenge(uuid)'::regprocedure);

  RETURN (
    SELECT c.user_id
    FROM public.email_challenges AS c
    WHERE c.id = p_challenge_id
    LIMIT 1
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_password_register_pending(p_email_norm text, p_password_hash text, p_last_name text, p_first_name text, p_patronymic text, p_role text)
 RETURNS TABLE(ok boolean, code text, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_email_norm text;
  v_last_name text;
  v_first_name text;
  v_patronymic text;
  v_display_name text;
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg]), 'app.email_password_register_pending(text,text,text,text,text,text)'::regprocedure);

  v_email_norm := lower(btrim(p_email_norm));
  v_last_name := NULLIF(btrim(p_last_name), '');
  v_first_name := NULLIF(btrim(p_first_name), '');
  v_patronymic := NULLIF(btrim(p_patronymic), '');

  IF p_role NOT IN ('client', 'doctor') THEN
    RETURN QUERY SELECT false, 'invalid_role'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid;
    RETURN;
  END IF;

  v_display_name := concat_ws(' ', v_last_name, v_first_name, v_patronymic);

  INSERT INTO public.platform_users (
    display_name,
    last_name,
    first_name,
    patronymic,
    role
  )
  VALUES (v_display_name, v_last_name, v_first_name, v_patronymic, p_role)
  RETURNING id INTO v_user_id;

  BEGIN
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary,
      confirmed_at, source_origin, updated_at
    ) VALUES (v_user_id, 'email', v_email_norm, true, NULL, 'direct', now());
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.platform_users WHERE id = v_user_id;
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.user_password_credentials (user_id, password_hash, updated_at)
  VALUES (v_user_id, p_password_hash, now());

  RETURN QUERY SELECT true, NULL::text, v_user_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, organization_slug text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_specialist_provision_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'signup.specialist.intent.by-challenge', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.get_specialist_signup_intent_by_challenge(uuid)'::regprocedure);

  RETURN QUERY
  SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
    i.organization_slug,
    i.specialist_full_name,
    i.status,
    i.provisioned_organization_id,
    i.provisioned_specialist_id,
    i.provisioned_membership_id
  FROM public.specialist_signup_intents AS i
  WHERE i.challenge_id = p_challenge_id
  LIMIT 1;
END
$function$;
