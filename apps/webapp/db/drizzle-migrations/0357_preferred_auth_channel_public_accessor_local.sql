-- TEMPORARY LOCAL MIGRATION NUMBER 0357
--
-- Cause 2 of 2 of the dead-login report (owner, 2026-08-04): the unauthenticated phone-login start
-- (`apps/webapp/src/app/api/auth/phone/start/route.ts`) resolves the caller's preferred auth
-- channel via `pgChannelPreferences.getPreferredAuthChannelCode()`, a direct
-- `SELECT ... FROM user_channel_preferences`. `user_channel_preferences` has table-level grants
-- (no RLS) for `app_patient`/`app_staff`/`app_owner` but NOT for the pre-session bootstrap login --
-- reproduced live 2026-08-04 03:59:18 TEST: `permission denied for table user_channel_preferences`
-- (42501) from `getPreferredAuthChannelCode -> resolveAuthOtpChannel`, thrown before any OTP is sent.
--
-- Fix -- same idiom as `app.get_public_config_bool` / `app.is_smtp_outbound_configured` (0240): a
-- narrow SECURITY DEFINER accessor, owned by `app_owner`, that answers only "which channel_code (if
-- any) is preferred for auth for this exact user id?" -- it returns nothing beyond what the caller
-- already asked for by argument, so granting it widens no exposure the way `GRANT SELECT` on the
-- whole table would (that would also open `is_enabled_for_messages`/`is_enabled_for_notifications`
-- rows for every other user's channel prefs to a request-reachable role). `app_patient` is granted
-- directly here (stable role name across every environment, mirrors the existing direct
-- `SELECT` grant on the table). The pre-session bootstrap login role's grant is environment-specific
-- (its login role name differs per host) and is added at deploy time in
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql, next to the other public-login
-- accessor grants it mirrors.
CREATE OR REPLACE FUNCTION app.get_preferred_auth_channel_code(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT preference.channel_code
  FROM public.user_channel_preferences AS preference
  WHERE (
      preference.platform_user_id = p_user_id
      OR (preference.platform_user_id IS NULL AND preference.user_id = p_user_id::text)
    )
    AND preference.is_preferred_for_auth = true
  LIMIT 1
$function$;

COMMENT ON FUNCTION app.get_preferred_auth_channel_code(uuid) IS
  'Public pre-session accessor: which channel_code (if any) is preferred_for_auth for this user id. Never returns other users'' rows or the message/notification flags.';

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.get_preferred_auth_channel_code(uuid) OWNER TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.get_preferred_auth_channel_code(uuid) FROM PUBLIC;

DO $accessor_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO app_staff;
  END IF;
END
$accessor_grants$;
