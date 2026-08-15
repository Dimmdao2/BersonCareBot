-- Specialist signup public bootstrap RLS/grants overlay.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/specialist-signup-public-bootstrap-rls.sql
--
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v specialist_signup_public_bootstrap_down=1 -f deploy/postgres/specialist-signup-public-bootstrap-rls.sql
--
-- This file intentionally contains no connection strings. Operators provide the approved TEST
-- connection context. It does not grant BYPASSRLS and does not grant app_patient broad table DML.

\set ON_ERROR_STOP on
\pset pager off

\if :{?specialist_signup_public_bootstrap_down}
\else
\set specialist_signup_public_bootstrap_down 0
\endif

SELECT 1 / (:'specialist_signup_public_bootstrap_down' IN ('0', '1'))::int
  AS specialist_signup_public_bootstrap_down_is_valid;

BEGIN;

\if :specialist_signup_public_bootstrap_down
-- Revoke the policy-helper EXECUTE grants added to SECURITY DEFINER owners in UP.
SELECT pg_get_userbyid(c.relowner) AS specialist_signup_system_settings_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'system_settings' AND c.relkind IN ('r', 'p') \gset
SELECT pg_get_userbyid(c.relowner) AS specialist_signup_password_credentials_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_password_credentials' AND c.relkind IN ('r', 'p') \gset
SELECT pg_get_userbyid(c.relowner) AS specialist_signup_oauth_bindings_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_oauth_bindings' AND c.relkind IN ('r', 'p') \gset
SELECT pg_get_userbyid(c.relowner) AS specialist_signup_staff_security_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'staff_security_profiles' AND c.relkind IN ('r', 'p') \gset
SELECT pg_get_userbyid(c.relowner) AS specialist_signup_intents_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'specialist_signup_intents' AND c.relkind IN ('r', 'p') \gset
SELECT quote_ident(COALESCE(:'specialist_signup_system_settings_owner', 'postgres')) AS specialist_signup_system_settings_owner_ident \gset
SELECT quote_ident(COALESCE(:'specialist_signup_password_credentials_owner', 'postgres')) AS specialist_signup_password_credentials_owner_ident \gset
SELECT quote_ident(COALESCE(:'specialist_signup_oauth_bindings_owner', 'postgres')) AS specialist_signup_oauth_bindings_owner_ident \gset
SELECT quote_ident(COALESCE(:'specialist_signup_staff_security_owner', 'postgres')) AS specialist_signup_staff_security_owner_ident \gset
SELECT quote_ident(COALESCE(:'specialist_signup_intents_owner', 'postgres')) AS specialist_signup_intents_owner_ident \gset
SELECT (to_regprocedure('app.current_org_id()') IS NOT NULL)::int AS specialist_signup_has_current_org_id \gset
\if :specialist_signup_has_current_org_id
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :specialist_signup_system_settings_owner_ident;
\endif
SELECT (to_regprocedure('app.current_patient_user_id()') IS NOT NULL)::int AS specialist_signup_has_current_patient_user_id \gset
\if :specialist_signup_has_current_patient_user_id
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_password_credentials_owner_ident;
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_oauth_bindings_owner_ident;
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :specialist_signup_staff_security_owner_ident;
\endif
REVOKE USAGE ON SCHEMA app FROM :specialist_signup_staff_security_owner_ident;
SELECT (to_regprocedure('app.require_staff_security_self_user_id()') IS NOT NULL)::int AS specialist_signup_has_self_helper \gset
\if :specialist_signup_has_self_helper
REVOKE EXECUTE ON FUNCTION app.require_staff_security_self_user_id() FROM :specialist_signup_intents_owner_ident;
\endif
DROP FUNCTION IF EXISTS app.get_specialist_signup_intent_by_challenge(uuid);
DROP FUNCTION IF EXISTS app.get_pending_specialist_signup_intent(uuid, uuid);
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, text, text, text);
DROP FUNCTION IF EXISTS app.get_latest_specialist_signup_intent_for_user();
DROP FUNCTION IF EXISTS app.replace_pending_specialist_signup_challenge(uuid, text);
DROP FUNCTION IF EXISTS app.replace_pending_specialist_signup_challenge(uuid);
DROP FUNCTION IF EXISTS app.revoke_staff_sessions();
DROP FUNCTION IF EXISTS app.record_failed_staff_factor_attempt();
DROP FUNCTION IF EXISTS app.consume_staff_recovery_login(text, text);
DROP FUNCTION IF EXISTS app.consume_staff_totp_login(text);
DROP FUNCTION IF EXISTS app.begin_staff_login_challenge(text, timestamptz);
DROP FUNCTION IF EXISTS app.confirm_staff_recovery_codes();
DROP FUNCTION IF EXISTS app.complete_staff_totp_enrollment(text, jsonb);
DROP FUNCTION IF EXISTS app.save_pending_staff_totp(text);
DROP FUNCTION IF EXISTS app.get_staff_security_session_state();
DROP FUNCTION IF EXISTS app.get_staff_security_profile();
DROP FUNCTION IF EXISTS app.ensure_staff_security_profile();
DROP FUNCTION IF EXISTS app.require_staff_security_self_user_id();
DROP FUNCTION IF EXISTS app.email_password_find_user_id_by_email_challenge(uuid);
DROP FUNCTION IF EXISTS app.email_password_find_reset_candidate(text);
DROP FUNCTION IF EXISTS app.email_password_find_login_candidate(text);
DROP FUNCTION IF EXISTS app.email_password_delete_unverified_registration(uuid);
DROP FUNCTION IF EXISTS app.email_password_register_pending(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS app.email_password_register_pending(text, text, text, text);
DROP FUNCTION IF EXISTS app.staff_user_has_web_oauth_binding(uuid);
DROP FUNCTION IF EXISTS app.staff_user_has_password_credentials(uuid);
DROP FUNCTION IF EXISTS app.current_patient_has_web_oauth_binding();
DROP FUNCTION IF EXISTS app.current_patient_has_password_credentials();
DROP FUNCTION IF EXISTS app.get_public_config_bool(text);
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
  -- Required because email_password_register_pending/_delete_unverified_registration/
  -- _find_login_candidate below are now pinned explicitly to app_owner (migration 0356's
  -- canonical set) instead of a derived table-owner ident.
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND rolbypassrls AND NOT rolcanlogin)
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.system_settings') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.user_password_credentials') IS NOT NULL
  AND to_regclass('public.user_oauth_bindings') IS NOT NULL
  AND to_regclass('public.email_challenges') IS NOT NULL
  AND to_regclass('public.specialist_signup_intents') IS NOT NULL
  AND to_regclass('public.staff_security_profiles') IS NOT NULL
  AND (
    to_regprocedure('app.replace_pending_specialist_signup_challenge(uuid)') IS NOT NULL
    OR to_regprocedure('app.replace_pending_specialist_signup_challenge(uuid,text)') IS NOT NULL
  )
  AND to_regprocedure('app.get_latest_specialist_signup_intent_for_user()') IS NOT NULL
  AND to_regprocedure('app.require_staff_security_self_user_id()') IS NOT NULL
  AND to_regprocedure('app.ensure_staff_security_profile()') IS NOT NULL
  AND to_regprocedure('app.get_staff_security_profile()') IS NOT NULL
  AND to_regprocedure('app.get_staff_security_session_state()') IS NOT NULL
  AND to_regprocedure('app.save_pending_staff_totp(text)') IS NOT NULL
  AND to_regprocedure('app.complete_staff_totp_enrollment(text,jsonb)') IS NOT NULL
  AND to_regprocedure('app.confirm_staff_recovery_codes()') IS NOT NULL
  AND to_regprocedure('app.begin_staff_login_challenge(text,timestamptz)') IS NOT NULL
  AND to_regprocedure('app.consume_staff_totp_login(text)') IS NOT NULL
  AND to_regprocedure('app.consume_staff_recovery_login(text,text)') IS NOT NULL
  AND to_regprocedure('app.record_failed_staff_factor_attempt()') IS NOT NULL
  AND to_regprocedure('app.revoke_staff_sessions()') IS NOT NULL
)::int AS specialist_signup_public_bootstrap_preflight_ok \gset

\if :specialist_signup_public_bootstrap_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- apply migrations through 0215 before the specialist signup bootstrap overlay.'
SELECT 1 / 0 AS specialist_signup_public_bootstrap_abort;
\endif

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_system_settings_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'system_settings'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_platform_users_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'platform_users'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_password_credentials_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_password_credentials'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_oauth_bindings_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_oauth_bindings'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_email_challenges_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'email_challenges'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_intents_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'specialist_signup_intents'
  AND c.relkind IN ('r', 'p') \gset

SELECT pg_get_userbyid(c.relowner) AS specialist_signup_staff_security_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'staff_security_profiles'
  AND c.relkind IN ('r', 'p') \gset

SELECT (:'specialist_signup_platform_users_owner' = :'specialist_signup_password_credentials_owner')::int
  AS specialist_signup_password_owner_preflight_ok \gset

\if :specialist_signup_password_owner_preflight_ok
\else
\echo 'FATAL: platform_users and user_password_credentials have different owners; refusing to add cross-owner grants.'
SELECT 1 / 0 AS specialist_signup_password_owner_abort;
\endif

SELECT quote_ident(:'specialist_signup_system_settings_owner') AS specialist_signup_system_settings_owner_ident \gset
SELECT quote_ident(:'specialist_signup_platform_users_owner') AS specialist_signup_platform_users_owner_ident \gset
SELECT quote_ident(:'specialist_signup_password_credentials_owner') AS specialist_signup_password_credentials_owner_ident \gset
SELECT quote_ident(:'specialist_signup_oauth_bindings_owner') AS specialist_signup_oauth_bindings_owner_ident \gset
SELECT quote_ident(:'specialist_signup_email_challenges_owner') AS specialist_signup_email_challenges_owner_ident \gset
SELECT quote_ident(:'specialist_signup_intents_owner') AS specialist_signup_intents_owner_ident \gset
SELECT quote_ident(:'specialist_signup_staff_security_owner') AS specialist_signup_staff_security_owner_ident \gset

-- This table is an account-security vault, not a runtime table surface. All callers use the
-- self-scoped SECURITY DEFINER functions below; reapplying the overlay also repairs stale broad
-- grants from an earlier rehearsal or default-privilege drift.
REVOKE ALL PRIVILEGES ON TABLE public.staff_security_profiles FROM app_patient, app_staff;
SELECT format(
  'REVOKE ALL PRIVILEGES (%s) ON TABLE public.staff_security_profiles FROM app_patient, app_staff',
  string_agg(quote_ident(attname), ', ' ORDER BY attnum)
)
FROM pg_attribute
WHERE attrelid = 'public.staff_security_profiles'::regclass
  AND attnum > 0
  AND NOT attisdropped
\gexec

SELECT (
  NOT has_table_privilege(
    'app_patient', 'public.staff_security_profiles',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  AND NOT has_any_column_privilege(
    'app_patient', 'public.staff_security_profiles', 'SELECT,INSERT,UPDATE,REFERENCES'
  )
  AND NOT has_table_privilege(
    'app_staff', 'public.staff_security_profiles',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  AND NOT has_any_column_privilege(
    'app_staff', 'public.staff_security_profiles', 'SELECT,INSERT,UPDATE,REFERENCES'
  )
)::int AS specialist_signup_staff_security_runtime_acl_closed \gset

\if :specialist_signup_staff_security_runtime_acl_closed
\else
\echo 'FATAL: staff_security_profiles must remain table-invisible to app_patient and app_staff.'
SELECT 1 / 0 AS specialist_signup_staff_security_runtime_acl_abort;
\endif

-- Staff-security SECURITY DEFINER functions call sibling helpers inside schema app. Their
-- derived table owner needs only schema name resolution; caller/runtime grants stay unchanged.
GRANT USAGE ON SCHEMA app TO :specialist_signup_staff_security_owner_ident;

SELECT has_schema_privilege(
  :'specialist_signup_staff_security_owner',
  'app',
  'USAGE'
)::int AS specialist_signup_staff_security_owner_schema_usage_ok \gset

\if :specialist_signup_staff_security_owner_schema_usage_ok
\else
\echo 'FATAL: derived staff-security owner lacks effective USAGE on schema app.'
SELECT 1 / 0 AS specialist_signup_staff_security_owner_schema_usage_abort;
\endif

CREATE OR REPLACE FUNCTION app.get_public_config_bool(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_key <> 'specialist_signup_enabled' THEN NULL::boolean
    WHEN s.value_json #> '{value}' = 'true'::jsonb THEN true
    WHEN s.value_json #> '{value}' = 'false'::jsonb THEN false
    WHEN lower(btrim(s.value_json #>> '{value}')) IN ('true', '1') THEN true
    WHEN lower(btrim(s.value_json #>> '{value}')) IN ('false', '0') THEN false
    ELSE NULL::boolean
  END
  FROM public.system_settings AS s
  WHERE p_key = 'specialist_signup_enabled'
    AND s.key = p_key
    AND s.scope = 'admin'
    AND s.organization_id IS NULL
  LIMIT 1
$$;

COMMENT ON FUNCTION app.get_public_config_bool(text) IS
  'Whitelisted public/pre-session config accessor. Currently exposes only specialist_signup_enabled as boolean; EXECUTE restricted to app_patient.';

ALTER FUNCTION app.get_public_config_bool(text) OWNER TO :specialist_signup_system_settings_owner_ident;

CREATE OR REPLACE FUNCTION app.current_patient_has_password_credentials()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  IF pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL THEN
    EXECUTE 'SELECT app.current_patient_user_id()' INTO v_patient_user_id;
  ELSE
    v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_password_credentials AS c
    WHERE c.user_id = v_patient_user_id
  );
END;
$$;

COMMENT ON FUNCTION app.current_patient_has_password_credentials() IS
  'Patient-self password credential presence check. Uses protected context when installed and legacy app.patient_user_id otherwise; returns only a boolean and never exposes password_hash.';

ALTER FUNCTION app.current_patient_has_password_credentials() OWNER TO :specialist_signup_password_credentials_owner_ident;

CREATE OR REPLACE FUNCTION app.staff_user_has_password_credentials(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_password_credentials AS c
    WHERE c.user_id = p_user_id
  )
$$;

COMMENT ON FUNCTION app.staff_user_has_password_credentials(uuid) IS
  'Staff-only password credential presence check for a server-resolved canonical user id; returns only a boolean and never exposes password_hash.';

ALTER FUNCTION app.staff_user_has_password_credentials(uuid) OWNER TO :specialist_signup_password_credentials_owner_ident;

CREATE OR REPLACE FUNCTION app.current_patient_has_web_oauth_binding()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  IF pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL THEN
    EXECUTE 'SELECT app.current_patient_user_id()' INTO v_patient_user_id;
  ELSE
    v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_oauth_bindings AS b
    WHERE b.user_id = v_patient_user_id
      AND b.provider IN ('google', 'yandex', 'apple')
  );
END;
$$;

COMMENT ON FUNCTION app.current_patient_has_web_oauth_binding() IS
  'Patient-self web OAuth presence check. Uses protected context when installed and legacy app.patient_user_id otherwise; returns only a boolean and never exposes provider credentials.';

ALTER FUNCTION app.current_patient_has_web_oauth_binding() OWNER TO :specialist_signup_oauth_bindings_owner_ident;

CREATE OR REPLACE FUNCTION app.staff_user_has_web_oauth_binding(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_oauth_bindings AS b
    WHERE b.user_id = p_user_id
      AND b.provider IN ('google', 'yandex', 'apple')
  )
$$;

COMMENT ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) IS
  'Staff-only web OAuth presence check for a server-resolved canonical user id; returns only a boolean and never exposes provider credentials.';

ALTER FUNCTION app.staff_user_has_web_oauth_binding(uuid) OWNER TO :specialist_signup_oauth_bindings_owner_ident;

DROP FUNCTION IF EXISTS app.email_password_register_pending(text, text, text, text);

CREATE OR REPLACE FUNCTION app.email_password_register_pending(
  p_email_norm text,
  p_password_hash text,
  p_last_name text,
  p_first_name text,
  p_patronymic text,
  p_role text
)
RETURNS TABLE (ok boolean, code text, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_last_name text := NULLIF(btrim(p_last_name), '');
  v_first_name text := NULLIF(btrim(p_first_name), '');
  v_patronymic text := NULLIF(btrim(p_patronymic), '');
  v_display_name text;
  v_user_id uuid;
BEGIN
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
    email,
    email_normalized,
    role
  )
  VALUES (v_display_name, v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, p_role)
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.user_password_credentials (user_id, password_hash, updated_at)
  VALUES (v_user_id, p_password_hash, now());

  RETURN QUERY SELECT true, NULL::text, v_user_id;
END
$$;

COMMENT ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) IS
  'Narrow SECURITY DEFINER for public structured email/password pending registration. Derives display_name and allows only client/doctor roles; no app_patient table DML grants.';

-- Migration 0356's canonical app_owner set (platform_users FORCE-RLS login fix): DROP+CREATE above
-- makes a brand-new function object, so it must pin app_owner explicitly, not derive from
-- :specialist_signup_platform_users_owner_ident/:specialist_signup_password_credentials_owner_ident
-- (the migrator role that owns these tables) -- that derivation is exactly the revert this pin
-- exists to stop. Confirmed live on TEST: every deploy silently handed these three back to the
-- migrator, which FORCE RLS then blocks from platform_users, and email/password login always failed
-- pre-session. See migration 0356's header for the reviewed app_owner scope this mirrors.
ALTER FUNCTION app.email_password_register_pending(text, text, text, text, text, text) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role IN ('client', 'doctor')
    AND merged_into_id IS NULL
    AND email_verified_at IS NULL
$$;

COMMENT ON FUNCTION app.email_password_delete_unverified_registration(uuid) IS
  'Narrow rollback accessor for failed public email/password registration; deletes only unverified client/doctor canonical users.';

-- Also migration 0356's canonical app_owner set -- same reasoning as email_password_register_pending above.
ALTER FUNCTION app.email_password_delete_unverified_registration(uuid) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.user_id
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
  LIMIT 1
$$;

COMMENT ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) IS
  'Narrow email challenge owner lookup for public email/password confirmation under app_patient.';

ALTER FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) OWNER TO :specialist_signup_email_challenges_owner_ident;

CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)
RETURNS TABLE (user_id uuid, password_hash text, email_verified boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT upc.user_id, upc.password_hash, (pu.email_verified_at IS NOT NULL)
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  WHERE pu.merged_into_id IS NULL
    AND pu.email_normalized = lower(btrim(p_email_norm))
  LIMIT 1
$$;

COMMENT ON FUNCTION app.email_password_find_login_candidate(text) IS
  'Narrow pre-auth email/password login lookup. It exposes one candidate only to the application so password verification stays in Node without granting credential-table access.';

-- Also migration 0356's canonical app_owner set -- same reasoning as email_password_register_pending above.
ALTER FUNCTION app.email_password_find_login_candidate(text) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app.email_password_find_reset_candidate(p_email_norm text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner',
    'app_pre_session',
    'pre_session',
    'auth.password.reset-candidate',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_email_norm))::app.port_typed_arg
    ]),
    'app.email_password_find_reset_candidate(text)'::regprocedure
  );
  SELECT candidate.user_id
  INTO v_user_id
  FROM app.email_password_find_login_candidate(p_email_norm) AS candidate
  WHERE candidate.email_verified = true
  LIMIT 1;
  RETURN v_user_id;
END
$$;

COMMENT ON FUNCTION app.email_password_find_reset_candidate(text) IS
  'Exact pre-session password-reset candidate lookup; returns only the verified canonical user id and never exposes a password hash.';

ALTER FUNCTION app.email_password_find_reset_candidate(text) OWNER TO app_owner;

-- Retire the former caller-targeted overload before exposing the self-scoped replacement.
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, text, text, text);
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, text, text, text, text);

CREATE FUNCTION app.create_specialist_signup_intent(
  p_challenge_id uuid,
  p_email_normalized text,
  p_organization_title text,
  p_specialist_full_name text,
  p_organization_slug text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_intent_id uuid;
BEGIN
  INSERT INTO public.specialist_signup_intents (
    user_id,
    challenge_id,
    email_normalized,
    organization_title,
    organization_slug,
    specialist_full_name
  )
  VALUES (
    app.require_staff_security_self_user_id(),
    p_challenge_id,
    lower(btrim(p_email_normalized)),
    btrim(p_organization_title),
    lower(p_organization_slug),
    btrim(p_specialist_full_name)
  )
  RETURNING id INTO v_intent_id;

  RETURN v_intent_id;
END
$$;

COMMENT ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) IS
  'Identity-self specialist signup START: creates the intent and carries its mandatory public slug to provisioning without reserving it.';

ALTER FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) OWNER TO :specialist_signup_intents_owner_ident;

DROP FUNCTION IF EXISTS app.get_pending_specialist_signup_intent(uuid, uuid);
CREATE OR REPLACE FUNCTION app.get_pending_specialist_signup_intent(
  p_user_id uuid,
  p_challenge_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  challenge_id uuid,
  email_normalized text,
  organization_title text,
  organization_slug text,
  specialist_full_name text,
  status text,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  WHERE i.user_id = p_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
$$;

COMMENT ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) IS
  'Narrow pending specialist signup intent lookup for pre-session provisioning checks.';

ALTER FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) OWNER TO :specialist_signup_intents_owner_ident;

DROP FUNCTION IF EXISTS app.get_specialist_signup_intent_by_challenge(uuid);
CREATE OR REPLACE FUNCTION app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  challenge_id uuid,
  email_normalized text,
  organization_title text,
  organization_slug text,
  specialist_full_name text,
  status text,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  LIMIT 1
$$;

COMMENT ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) IS
  'Narrow specialist signup intent lookup by challenge id for confirm retry after email challenge consumption.';

ALTER FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) OWNER TO :specialist_signup_intents_owner_ident;

DROP FUNCTION IF EXISTS app.replace_pending_specialist_signup_challenge(uuid);
DROP FUNCTION IF EXISTS app.replace_pending_specialist_signup_challenge(uuid, text);
CREATE FUNCTION app.replace_pending_specialist_signup_challenge(
  p_challenge_id uuid,
  p_organization_slug text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_intent_id uuid;
BEGIN
  SELECT intent.id
  INTO v_intent_id
  FROM public.specialist_signup_intents AS intent
  WHERE intent.user_id = app.require_staff_security_self_user_id()
    AND intent.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF v_intent_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.specialist_signup_intents AS intent
  SET challenge_id = p_challenge_id,
      organization_slug = lower(p_organization_slug)
  WHERE intent.id = v_intent_id;
  RETURN FOUND;
END
$$;

ALTER FUNCTION app.replace_pending_specialist_signup_challenge(uuid, text)
  OWNER TO :specialist_signup_intents_owner_ident;

DROP FUNCTION IF EXISTS app.get_latest_specialist_signup_intent_for_user();
CREATE FUNCTION app.get_latest_specialist_signup_intent_for_user()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  challenge_id uuid,
  email_normalized text,
  organization_title text,
  organization_slug text,
  specialist_full_name text,
  status text,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    intent.id,
    intent.user_id,
    intent.challenge_id,
    intent.email_normalized,
    intent.organization_title,
    intent.organization_slug,
    intent.specialist_full_name,
    intent.status,
    intent.provisioned_organization_id,
    intent.provisioned_specialist_id,
    intent.provisioned_membership_id
  FROM public.specialist_signup_intents AS intent
  WHERE intent.user_id = app.require_staff_security_self_user_id()
  ORDER BY intent.created_at DESC
  LIMIT 1
$$;

ALTER FUNCTION app.get_latest_specialist_signup_intent_for_user()
  OWNER TO :specialist_signup_intents_owner_ident;
ALTER FUNCTION app.require_staff_security_self_user_id()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.ensure_staff_security_profile()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.get_staff_security_profile()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.get_staff_security_session_state()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.save_pending_staff_totp(text)
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.complete_staff_totp_enrollment(text, jsonb)
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.confirm_staff_recovery_codes()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.begin_staff_login_challenge(text, timestamptz)
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.consume_staff_totp_login(text)
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.consume_staff_recovery_login(text, text)
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.record_failed_staff_factor_attempt()
  OWNER TO :specialist_signup_staff_security_owner_ident;
ALTER FUNCTION app.revoke_staff_sessions()
  OWNER TO :specialist_signup_staff_security_owner_ident;

REVOKE ALL ON FUNCTION app.get_public_config_bool(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_patient_has_password_credentials() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_patient_has_web_oauth_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_delete_unverified_registration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_find_login_candidate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_find_reset_candidate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.replace_pending_specialist_signup_challenge(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_latest_specialist_signup_intent_for_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.require_staff_security_self_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_staff_security_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_staff_security_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_staff_security_session_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.save_pending_staff_totp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.confirm_staff_recovery_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.begin_staff_login_challenge(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_staff_totp_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_staff_recovery_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_failed_staff_factor_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revoke_staff_sessions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;
GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.staff_user_has_web_oauth_binding(uuid) TO app_staff;
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_find_reset_candidate(text) TO app_pre_session;
GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.replace_pending_specialist_signup_challenge(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_latest_specialist_signup_intent_for_user() TO app_patient;
GRANT EXECUTE ON FUNCTION app.ensure_staff_security_profile() TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_staff_security_profile() TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_staff_security_session_state() TO app_patient;
GRANT EXECUTE ON FUNCTION app.save_pending_staff_totp(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) TO app_patient;
GRANT EXECUTE ON FUNCTION app.confirm_staff_recovery_codes() TO app_patient;
GRANT EXECUTE ON FUNCTION app.begin_staff_login_challenge(text, timestamptz) TO app_patient;
GRANT EXECUTE ON FUNCTION app.consume_staff_totp_login(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.consume_staff_recovery_login(text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.record_failed_staff_factor_attempt() TO app_patient;
GRANT EXECUTE ON FUNCTION app.revoke_staff_sessions() TO app_patient;

-- app.get_public_config_bool reads FORCE-RLS public.system_settings, whose policy predicate
-- calls app.current_org_id(). A SECURITY DEFINER runs as the function owner (the table owner),
-- which must be able to EXECUTE that policy helper or the read fails at plan time with
-- "permission denied for function current_org_id". This grants only EXECUTE on a session-context
-- reader (same as app_staff/app_patient already hold); it does NOT grant BYPASSRLS.
SELECT (to_regprocedure('app.current_org_id()') IS NOT NULL)::int AS specialist_signup_has_current_org_id \gset
\if :specialist_signup_has_current_org_id
GRANT EXECUTE ON FUNCTION app.current_org_id() TO :specialist_signup_system_settings_owner_ident;
\endif
SELECT (to_regprocedure('app.current_patient_user_id()') IS NOT NULL)::int AS specialist_signup_has_current_patient_user_id \gset
\if :specialist_signup_has_current_patient_user_id
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :specialist_signup_password_credentials_owner_ident;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :specialist_signup_oauth_bindings_owner_ident;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :specialist_signup_staff_security_owner_ident;
\endif
GRANT EXECUTE ON FUNCTION app.require_staff_security_self_user_id() TO :specialist_signup_intents_owner_ident;
\endif

COMMIT;

\if :specialist_signup_public_bootstrap_down
\echo 'specialist-signup public bootstrap functions DOWN complete.'
\else
\echo 'specialist-signup public bootstrap functions UP complete.'
\endif
