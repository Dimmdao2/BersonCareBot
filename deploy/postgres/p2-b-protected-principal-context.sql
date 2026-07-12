-- Phase 2 / P2-B protected DB principal context.
--
-- Purpose:
--   - install the protected backend-context table used by app.current_*() helper functions;
--   - install the signed SECURITY DEFINER setter used by packages/db-principal locked mode;
--   - keep app.is_staff() role-derived;
--   - avoid committing or printing real signing secrets.
--
-- Required psql variables for UP:
--   - p2_b_owner_role
--   - p2_b_staff_role
--   - p2_b_patient_role
--   - p2_b_signing_secret
--
-- Rollback:
--   Re-run with -v p2_b_down=1 plus the same role variables. The down block drops only P2-B
--   app schema functions/tables and does not drop roles, reassign ownership, or touch app data.

\set ON_ERROR_STOP on
\pset pager off

\if :{?p2_b_owner_role}
\else
\echo 'FATAL: missing required psql variable p2_b_owner_role.'
SELECT 1 / 0 AS p2_b_abort;
\endif

\if :{?p2_b_staff_role}
\else
\echo 'FATAL: missing required psql variable p2_b_staff_role.'
SELECT 1 / 0 AS p2_b_abort;
\endif

\if :{?p2_b_patient_role}
\else
\echo 'FATAL: missing required psql variable p2_b_patient_role.'
SELECT 1 / 0 AS p2_b_abort;
\endif

SELECT (
  length(:'p2_b_owner_role') > 0
  AND length(:'p2_b_staff_role') > 0
  AND length(:'p2_b_patient_role') > 0
  AND :'p2_b_owner_role' <> :'p2_b_staff_role'
  AND :'p2_b_owner_role' <> :'p2_b_patient_role'
  AND :'p2_b_staff_role' <> :'p2_b_patient_role'
)::int AS p2_b_role_names_valid \gset

\if :p2_b_role_names_valid
\else
\echo 'FATAL: P2-B role names must be non-empty and distinct.'
SELECT 1 / 0 AS p2_b_abort;
\endif

\if :{?p2_b_down}
SELECT format($p2_b_user_phone_history_revoke$
DO $$
BEGIN
  IF to_regclass('public.user_phone_history') IS NOT NULL THEN
    EXECUTE format('REVOKE SELECT, UPDATE ON public.user_phone_history FROM %%I', %L);
  END IF;
END $$;
$p2_b_user_phone_history_revoke$, :'p2_b_owner_role') \gexec

DROP FUNCTION IF EXISTS app.close_active_user_phone_history(uuid);
DROP FUNCTION IF EXISTS app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS app.current_org_id();
DROP FUNCTION IF EXISTS app.current_patient_user_id();
DROP FUNCTION IF EXISTS app.current_integrator_user_id();
DROP FUNCTION IF EXISTS app.reset_principal_context();
DROP FUNCTION IF EXISTS app.release_principal_context();
DROP FUNCTION IF EXISTS app.is_staff();
DROP TABLE IF EXISTS app.principal_context;
DROP TABLE IF EXISTS app.context_nonce_ledger;
DROP TABLE IF EXISTS app.context_signing_secrets;
\echo 'P2-B protected principal context DOWN complete.'
\quit
\endif

\if :{?p2_b_signing_secret}
\else
\echo 'FATAL: missing required psql variable p2_b_signing_secret.'
SELECT 1 / 0 AS p2_b_abort;
\endif

SELECT (length(:'p2_b_signing_secret') >= 32)::int AS p2_b_secret_valid \gset

\if :p2_b_secret_valid
\else
\echo 'FATAL: p2_b_signing_secret must be at least 32 characters.'
SELECT 1 / 0 AS p2_b_abort;
\endif

CREATE SCHEMA IF NOT EXISTS app_ext;
DO $$
DECLARE
  v_pgcrypto_schema text;
BEGIN
  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
  ELSIF v_pgcrypto_schema <> 'app_ext' THEN
    RAISE EXCEPTION 'pgcrypto_must_be_installed_in_app_ext';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION :"p2_b_owner_role";
ALTER SCHEMA app OWNER TO :"p2_b_owner_role";

GRANT USAGE ON SCHEMA app TO :"p2_b_staff_role", :"p2_b_patient_role";

SET ROLE :"p2_b_owner_role";

CREATE TABLE IF NOT EXISTS app.context_signing_secrets (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL CHECK (length(secret) >= 32)
);

INSERT INTO app.context_signing_secrets (id, secret)
VALUES (true, :'p2_b_signing_secret')
ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret;

CREATE TABLE IF NOT EXISTS app.principal_context (
  backend_pid integer PRIMARY KEY CHECK (backend_pid > 0),
  org_id uuid,
  patient_user_id uuid,
  integrator_user_id bigint,
  nonce text NOT NULL,
  expires_epoch bigint NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE app.principal_context ALTER COLUMN org_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS app.context_nonce_ledger (
  nonce text PRIMARY KEY,
  backend_pid integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_epoch bigint NOT NULL
);

CREATE OR REPLACE FUNCTION app.install_signed_context(
  p_nonce text,
  p_backend_pid integer,
  p_expires_epoch bigint,
  p_org_id uuid,
  p_patient_user_id uuid,
  p_integrator_user_id bigint,
  p_signature_hex text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, app_ext, pg_catalog
AS $$
DECLARE
  v_secret text;
  v_canonical text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$' THEN
    RAISE EXCEPTION 'invalid_nonce';
  END IF;

  IF p_backend_pid <> pg_backend_pid() THEN
    RAISE EXCEPTION 'wrong_backend';
  END IF;

  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF p_expires_epoch <= v_now_epoch THEN
    RAISE EXCEPTION 'expired_context';
  END IF;
  IF p_expires_epoch > v_now_epoch + 300 THEN
    RAISE EXCEPTION 'context_ttl_too_long';
  END IF;

  IF p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'bad_signature';
  END IF;

  SELECT secret INTO STRICT v_secret
  FROM app.context_signing_secrets
  WHERE id = true;

  v_canonical := concat_ws(
    '|',
    'v1',
    p_nonce,
    p_backend_pid::text,
    p_expires_epoch::text,
    COALESCE(p_org_id::text, ''),
    COALESCE(p_patient_user_id::text, ''),
    COALESCE(p_integrator_user_id::text, '')
  );
  v_expected := encode(app_ext.hmac(v_canonical, v_secret, 'sha256'), 'hex');

  IF lower(p_signature_hex) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'bad_signature';
  END IF;

  BEGIN
    INSERT INTO app.context_nonce_ledger (nonce, backend_pid, expires_epoch)
    VALUES (p_nonce, p_backend_pid, p_expires_epoch);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'replayed_context_signature';
  END;

  INSERT INTO app.principal_context (
    backend_pid,
    org_id,
    patient_user_id,
    integrator_user_id,
    nonce,
    expires_epoch
  )
  VALUES (
    p_backend_pid,
    p_org_id,
    p_patient_user_id,
    p_integrator_user_id,
    p_nonce,
    p_expires_epoch
  )
  ON CONFLICT (backend_pid) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    patient_user_id = EXCLUDED.patient_user_id,
    integrator_user_id = EXCLUDED.integrator_user_id,
    nonce = EXCLUDED.nonce,
    expires_epoch = EXCLUDED.expires_epoch,
    installed_at = clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT org_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.current_patient_user_id() RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT patient_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.current_integrator_user_id() RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT integrator_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.reset_principal_context() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;

CREATE OR REPLACE FUNCTION app.release_principal_context() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;

-- Server-internal identity maintenance helper. It intentionally does not perform
-- per-call authorization: callers must pass a server-resolved platform_user_id.
-- check_function_bodies is disabled only for this CREATE because the function forward-references
-- public.user_phone_history, which may not yet exist when this deploy artifact runs on a bare
-- schema (e.g. policy-surface smokes apply p2-b before the table stub). The real deploy chain
-- applies this after migrations, where the table already exists.
SET check_function_bodies = off;
CREATE OR REPLACE FUNCTION app.close_active_user_phone_history(p_user uuid) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  UPDATE public.user_phone_history SET valid_to = now()
  WHERE platform_user_id = p_user AND valid_to IS NULL
    AND (app.current_patient_user_id() IS NULL OR platform_user_id = app.current_patient_user_id())
$$;
RESET check_function_bodies;

ALTER FUNCTION app.close_active_user_phone_history(uuid) OWNER TO :"p2_b_owner_role";

SELECT format($p2_b_is_staff$
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user = %L
    OR pg_has_role(current_user, %L, 'member')
$$
$p2_b_is_staff$, :'p2_b_staff_role', :'p2_b_staff_role') \gexec

REVOKE ALL ON app.context_signing_secrets FROM PUBLIC;
REVOKE ALL ON app.principal_context FROM PUBLIC;
REVOKE ALL ON app.context_nonce_ledger FROM PUBLIC;
REVOKE ALL ON app.context_signing_secrets FROM :"p2_b_staff_role", :"p2_b_patient_role";
REVOKE ALL ON app.principal_context FROM :"p2_b_staff_role", :"p2_b_patient_role";
REVOKE ALL ON app.context_nonce_ledger FROM :"p2_b_staff_role", :"p2_b_patient_role";

REVOKE EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.current_integrator_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.reset_principal_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.is_staff() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)
  TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :"p2_b_staff_role", :"p2_b_patient_role";
GRANT EXECUTE ON FUNCTION app.is_staff() TO :"p2_b_staff_role", :"p2_b_patient_role";

RESET ROLE;

-- Grant table DML to the definer owner role AS THE INVOKING TABLE OWNER (the p2_b_owner_role owns
-- schema app, NOT the public tables, so it cannot self-grant). Runs after RESET ROLE so current_user
-- is the invoking table-owner role. Guarded so it is a no-op on bare policy-surface stubs where the
-- table is created after p2-b.
SELECT format($p2_b_user_phone_history_grant$
DO $$
BEGIN
  IF to_regclass('public.user_phone_history') IS NOT NULL THEN
    EXECUTE format('GRANT SELECT, UPDATE ON public.user_phone_history TO %%I', %L);
  END IF;
END $$;
$p2_b_user_phone_history_grant$, :'p2_b_owner_role') \gexec

\echo 'P2-B protected principal context UP complete.'
