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
DROP FUNCTION IF EXISTS app.get_specialist_signup_intent_by_challenge(uuid);
DROP FUNCTION IF EXISTS app.get_pending_specialist_signup_intent(uuid, uuid);
DROP FUNCTION IF EXISTS app.create_specialist_signup_intent(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS app.email_password_find_user_id_by_email_challenge(uuid);
DROP FUNCTION IF EXISTS app.email_password_delete_unverified_registration(uuid);
DROP FUNCTION IF EXISTS app.email_password_register_pending(text, text, text, text);
DROP FUNCTION IF EXISTS app.get_public_config_bool(text);
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.system_settings') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.user_password_credentials') IS NOT NULL
  AND to_regclass('public.email_challenges') IS NOT NULL
  AND to_regclass('public.specialist_signup_intents') IS NOT NULL
)::int AS specialist_signup_public_bootstrap_preflight_ok \gset

\if :specialist_signup_public_bootstrap_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient, schema app, system_settings/users/passwords/email_challenges/signup_intents tables must all exist.'
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

SELECT (:'specialist_signup_platform_users_owner' = :'specialist_signup_password_credentials_owner')::int
  AS specialist_signup_password_owner_preflight_ok \gset

\if :specialist_signup_password_owner_preflight_ok
\else
\echo 'FATAL: platform_users and user_password_credentials have different owners; refusing to add cross-owner grants.'
SELECT 1 / 0 AS specialist_signup_password_owner_abort;
\endif

SELECT quote_ident(:'specialist_signup_system_settings_owner') AS specialist_signup_system_settings_owner_ident \gset
SELECT quote_ident(:'specialist_signup_platform_users_owner') AS specialist_signup_platform_users_owner_ident \gset
SELECT quote_ident(:'specialist_signup_email_challenges_owner') AS specialist_signup_email_challenges_owner_ident \gset
SELECT quote_ident(:'specialist_signup_intents_owner') AS specialist_signup_intents_owner_ident \gset

CREATE OR REPLACE FUNCTION app.get_public_config_bool(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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

CREATE OR REPLACE FUNCTION app.email_password_register_pending(
  p_email_norm text,
  p_password_hash text,
  p_display_name text,
  p_role text
)
RETURNS TABLE (ok boolean, code text, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_display_name text := COALESCE(NULLIF(btrim(p_display_name), ''), split_part(lower(btrim(p_email_norm)), '@', 1), lower(btrim(p_email_norm)));
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

  INSERT INTO public.platform_users (display_name, email, email_normalized, role)
  VALUES (v_display_name, v_email_norm, v_email_norm, p_role)
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

COMMENT ON FUNCTION app.email_password_register_pending(text, text, text, text) IS
  'Narrow SECURITY DEFINER for public email/password pending registration. Allows only client/doctor roles; no app_patient table DML grants.';

ALTER FUNCTION app.email_password_register_pending(text, text, text, text) OWNER TO :specialist_signup_platform_users_owner_ident;

CREATE OR REPLACE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role IN ('client', 'doctor')
    AND merged_into_id IS NULL
    AND email_verified_at IS NULL
$$;

COMMENT ON FUNCTION app.email_password_delete_unverified_registration(uuid) IS
  'Narrow rollback accessor for failed public email/password registration; deletes only unverified client/doctor canonical users.';

ALTER FUNCTION app.email_password_delete_unverified_registration(uuid) OWNER TO :specialist_signup_platform_users_owner_ident;

CREATE OR REPLACE FUNCTION app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.user_id
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
  LIMIT 1
$$;

COMMENT ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) IS
  'Narrow email challenge owner lookup for public email/password confirmation under app_patient.';

ALTER FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) OWNER TO :specialist_signup_email_challenges_owner_ident;

CREATE OR REPLACE FUNCTION app.create_specialist_signup_intent(
  p_user_id uuid,
  p_challenge_id uuid,
  p_email_normalized text,
  p_organization_title text,
  p_specialist_full_name text
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  INSERT INTO public.specialist_signup_intents (
    user_id,
    challenge_id,
    email_normalized,
    organization_title,
    specialist_full_name
  )
  VALUES (
    p_user_id,
    p_challenge_id,
    lower(btrim(p_email_normalized)),
    btrim(p_organization_title),
    btrim(p_specialist_full_name)
  )
  RETURNING id
$$;

COMMENT ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) IS
  'Narrow SECURITY DEFINER for public specialist signup START intent creation under app_patient.';

ALTER FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) OWNER TO :specialist_signup_intents_owner_ident;

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
  specialist_full_name text,
  status text,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
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

CREATE OR REPLACE FUNCTION app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  challenge_id uuid,
  email_normalized text,
  organization_title text,
  specialist_full_name text,
  status text,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
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

REVOKE ALL ON FUNCTION app.get_public_config_bool(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_register_pending(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_delete_unverified_registration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) TO app_patient;
\endif

COMMIT;

\if :specialist_signup_public_bootstrap_down
\echo 'specialist-signup public bootstrap functions DOWN complete.'
\else
\echo 'specialist-signup public bootstrap functions UP complete.'
\endif
