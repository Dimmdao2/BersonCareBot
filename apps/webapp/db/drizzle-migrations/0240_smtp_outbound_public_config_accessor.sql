-- 0240_smtp_outbound_public_config_accessor: the public login screen (unauthenticated bootstrap
-- pool) must be able to show "code to e-mail" as a login alternative whenever outbound SMTP is
-- configured, WITHOUT ever gaining SELECT on `public.system_settings` (that table also holds every
-- other admin allowlist/secret). Root cause this migration closes:
--
--   modules/auth/authChannelPolicy.ts:isSmtpConfigured() -> getConfigValue("smtp_outbound", "") ->
--   infra/repos/pgSystemSettings.ts:readAdminSystemSettingString() -> readSystemSettingInnerValueByScopes()
--   runs a DIRECT `SELECT ... FROM system_settings`. Under FORCE RLS that direct SELECT requires the
--   CALLER to hold table-level SELECT on system_settings. app_staff has it; the unauthenticated
--   bootstrap login (`app.get_public_config_bool` grantee class) and app_patient do NOT, by design —
--   same reviewed shape as app.read_integrator_smtp_outbound_setting() (0235) and
--   app.get_public_config_bool (specialist-signup-public-bootstrap-rls.sql). The direct SELECT then
--   raises `permission denied for table system_settings` (42501), which
--   modules/system-settings/configAdapter.ts:fetchFromDb() swallows into `null`, silently falling
--   back to the env default `""` and reporting "SMTP not configured" even when it is. Reproduced live
--   (2026-07-25) with `SET LOCAL ROLE bcb_test_nonstaff_login`.
--
-- Fix — a boolean-only SECURITY DEFINER accessor, built to the exact same idiom as
-- app.get_public_config_bool / app.read_public_runtime_setting / app.read_integrator_smtp_outbound_setting:
-- owned by app_owner (NOLOGIN, BYPASSRLS, zero members, not request-reachable), `SET search_path`
-- pinned to pg_catalog, EXECUTE revoked from PUBLIC and granted only to the roles that need it. It
-- answers ONLY "is outbound e-mail configured?" — it never returns the host/user/password/from
-- fields themselves, so granting it widens no secret exposure at all, unlike granting SELECT on the
-- underlying table would. The unauthenticated bootstrap login role's grant is environment-specific
-- (its login name differs per host) and is therefore added at deploy time to
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql, next to the identical
-- app.get_public_config_bool(text) grant it mirrors; app_patient (the other class of caller that
-- already has app.get_public_config_bool) is granted directly here since that role name is stable
-- across every environment.
--
-- "Configured" mirrors the field set apps/integrator/src/config/smtpOutbound.ts already requires to
-- actually send mail (host/user/password/from non-empty; port/secure are optional/defaulted there),
-- so this accessor can never report "configured" for a shape the integrator would itself refuse to
-- send with.
CREATE OR REPLACE FUNCTION app.is_smtp_outbound_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    (
      SELECT
        NULLIF(btrim(setting.value_json #>> '{value,host}'), '') IS NOT NULL
        AND NULLIF(btrim(setting.value_json #>> '{value,user}'), '') IS NOT NULL
        AND NULLIF(btrim(setting.value_json #>> '{value,password}'), '') IS NOT NULL
        AND NULLIF(btrim(setting.value_json #>> '{value,from}'), '') IS NOT NULL
      FROM public.system_settings AS setting
      WHERE setting.key = 'smtp_outbound'
        AND setting.scope = 'admin'
        AND setting.organization_id IS NULL
      LIMIT 1
    ),
    false
  )
$function$;

COMMENT ON FUNCTION app.is_smtp_outbound_configured() IS
  'Boolean-only public-login accessor: is outbound SMTP configured? Never returns host/user/password/from -- only their presence.';

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The definer identity, exactly as 0225/0235/0238 do it.
    ALTER FUNCTION app.is_smtp_outbound_configured() OWNER TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.is_smtp_outbound_configured() FROM PUBLIC;

DO $accessor_grants$
BEGIN
  -- app_patient: same class of caller as app.get_public_config_bool (stable role name across every
  -- environment). The unauthenticated bootstrap login's grant is environment-specific (its login
  -- role name differs per host) and is added at deploy time in
  -- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql instead of here.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.is_smtp_outbound_configured() TO app_patient;
  END IF;
END
$accessor_grants$;
