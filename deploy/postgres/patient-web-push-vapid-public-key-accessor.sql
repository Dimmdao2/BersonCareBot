-- Narrow SECURITY DEFINER accessor for the web-push VAPID PUBLIC key only (taskdb #708 follow-up,
-- 2026-07-13): unblocks GET /api/patient/web-push/status under the app_patient DB role WITHOUT
-- granting app_patient any read access to public.system_settings, which also holds admin allowlists,
-- SMTP/payment-provider secrets, dev-mode flags, etc -- deliberately excluded from the app_patient
-- grant sweep by design (rls-descriptor-model.mjs's BOOTSTRAP-hybrid carve-out: "explicitly out of
-- scope per owner instruction, pre-org-context"; confirmed live -- app_patient has ZERO grants on
-- public.system_settings, only app_staff/app_worker/the table owner do).
--
-- Root cause (confirmed live on bersoncarebot_test): GET /api/patient/web-push/status
-- (apps/webapp/src/app/api/patient/web-push/status/route.ts) read system_settings key=
-- 'web_push_vapid' scope='admin' via getWebPushVapidKeyPair -> SystemSettingsService.getSetting ->
-- pgSystemSettings.getByKey -- a plain SELECT against public.system_settings -- "permission denied
-- for table system_settings" under app_patient.
--
-- Fix: a STABLE SECURITY DEFINER function in the existing `app` schema (same schema/ownership
-- pattern as app.is_staff()/app.current_org_id()/app.current_patient_user_id(), all owned by
-- app_owner per deploy/postgres/p2-b-protected-principal-context.sql), that reads ONLY the public
-- half of the `web_push_vapid` envelope and returns it as a bare text value. The privateKey field is
-- never referenced anywhere in this function body, so it cannot leak through this path even if the
-- row shape changes later. EXECUTE is revoked from PUBLIC and granted ONLY to app_patient --
-- app_staff keeps reading the table directly (it already has the whole-table SELECT grant and needs
-- privateKey too, for the doctor/admin web-push status + send paths).
--
-- NOTE (found live while applying this script): BYPASSRLS on app_owner only skips row-security
-- POLICY checks -- it does NOT imply table-level SELECT privilege, which is a separate grant system.
-- app_owner does not own public.system_settings (bersoncarebot_test does) and had no grant on it at
-- all, so the function failed with "permission denied for table system_settings" even as SECURITY
-- DEFINER until this narrow SELECT grant (below) was added -- app_owner is NOLOGIN (nothing can
-- authenticate as it directly) and is already the maximally-trusted definer identity for every
-- function in this schema (it owns app.context_signing_secrets, the HMAC secret store for signed
-- principal-context installation), so this SELECT grant does not introduce a new trust tier.
--
-- Idempotent / safe to re-run: CREATE OR REPLACE FUNCTION + REVOKE/GRANT are all no-ops if already
-- current.
--
-- Rollback: re-run with -v patient_vapid_accessor_down=1 -- drops the function (its GRANT/REVOKE
-- state goes away with it).

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.system_settings') IS NOT NULL
)::int AS patient_vapid_accessor_preflight_ok \gset

\if :patient_vapid_accessor_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient/app_owner roles, schema app, public.system_settings must all exist.'
SELECT 1 / 0 AS patient_vapid_accessor_abort;
\endif

\if :{?patient_vapid_accessor_down}

DROP FUNCTION IF EXISTS app.get_web_push_vapid_public_key();
REVOKE SELECT ON TABLE public.system_settings FROM app_owner;

\echo 'patient-web-push-vapid-public-key-accessor DOWN complete: app.get_web_push_vapid_public_key() dropped, app_owner grant revoked.'

\else

-- app_owner needs base table SELECT to read system_settings at all (BYPASSRLS only skips the RLS
-- policy check, not the table-level grant check) -- see note above. Granted here, not inside the
-- SET ROLE block below, since GRANT ON TABLE requires the table owner's (bersoncarebot_test)
-- privilege, not app_owner's.
GRANT SELECT ON TABLE public.system_settings TO app_owner;

SET ROLE app_owner;

CREATE OR REPLACE FUNCTION app.get_web_push_vapid_public_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(btrim(s.value_json #>> '{value,publicKey}'), '')
  FROM public.system_settings AS s
  WHERE s.key = 'web_push_vapid'
    AND s.scope = 'admin'
    AND s.organization_id IS NULL
  LIMIT 1
$$;

COMMENT ON FUNCTION app.get_web_push_vapid_public_key() IS
  'Narrow patient-safe accessor (taskdb #708): returns ONLY the public half of the web_push_vapid '
  'system_settings envelope. Never references privateKey. EXECUTE restricted to app_patient.';

RESET ROLE;

-- Explicit belt-and-suspenders (mirrors p2-b-protected-principal-context.sql): CREATE OR REPLACE
-- FUNCTION does not change ownership of a pre-existing object, so pin it explicitly too.
ALTER FUNCTION app.get_web_push_vapid_public_key() OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.get_web_push_vapid_public_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_web_push_vapid_public_key() TO app_patient;

\echo 'patient-web-push-vapid-public-key-accessor UP complete: app.get_web_push_vapid_public_key() installed (owner app_owner), EXECUTE granted to app_patient only.'

\endif
