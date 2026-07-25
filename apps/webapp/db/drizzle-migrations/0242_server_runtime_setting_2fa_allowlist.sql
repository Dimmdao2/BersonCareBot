-- 0242_server_runtime_setting_2fa_allowlist: the 2FA enforcement toggle has been a dead switch on
-- every environment since it was introduced.
--
-- ROOT CAUSE: app.read_webapp_server_runtime_setting(p_key, p_scope) (last redefined in migration
-- 0231_admin_email_role_runtime_config.sql) carries a hardcoded allowlist of the only `key` values
-- it will ever return. Migration 0236_global_admin_channel_auth_toggles.sql introduced the
-- `auth_2fa_enabled` setting (scope 'admin', audience 'server') and its row in
-- public.app_runtime_settings, but never added 'auth_2fa_enabled' to that allowlist. Every read via
-- modules/system-settings/configAdapter.ts:getServerRuntimeBool("auth_2fa_enabled") (used by
-- app-layer/guards/requireRole.ts) therefore falls through the accessor's WHERE clause, gets zero
-- rows back, and getServerBoolean() silently returns the compiled default `false` -- regardless of
-- what an administrator stores in the setting. Confirmed live on TEST (2026-07-25): the row exists
-- with value {"value": false}, but the function's prosrc allowlist omits the key entirely.
--
-- The other two toggles 0236 introduced, auth_oauth_google_enabled / auth_oauth_yandex_enabled, are
-- NOT affected by this defect: their audience is 'public', so they are read through a different,
-- already-correct accessor path (getPublicRuntimeBool / the app_runtime_settings public projection),
-- never through this server-only function. auth_2fa_enabled is the only key introduced after 0231
-- that this function is meant to serve and was left out -- checked against every migration between
-- 0232 and 0241 inclusive; none of them add another app_runtime_settings row with audience='server'.
--
-- FIX: CREATE OR REPLACE the accessor with 'auth_2fa_enabled' added to the allowlist. Signature,
-- LANGUAGE, STABLE, SECURITY DEFINER, SET search_path, owner and ACL are all otherwise byte-for-byte
-- identical to the 0231 definition -- this is a pure allowlist widening, not a new function, so it
-- does not change `expected_secdef_count` in deploy/host/deploy-test-saas.sh (still 56: CREATE OR
-- REPLACE of an existing same-signature function creates no new pg_proc row and PostgreSQL retains
-- the existing owner and ACL across the replace).
--
-- This migration does NOT flip the stored value of auth_2fa_enabled. It stays `false` on every
-- environment after this runs -- turning enforcement on is the owner's decision, made later via the
-- admin settings UI, not something this migration does. Making the toggle *readable* is a
-- prerequisite for that decision to ever take effect; it is not the decision itself.
CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE (
  key text,
  scope text,
  organization_id uuid,
  audience text,
  value_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'server'
    AND setting.key IN (
      'debug_forward_to_admin', 'video_presign_ttl_seconds',
      'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
      'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones',
      'auth_2fa_enabled'
    )
  LIMIT 1
$function$;

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The definer identity is unchanged by this replace -- restated defensively, exactly as
    -- 0225/0235/0238/0240 do it, so this migration is self-contained regardless of which role
    -- executes it.
    ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;

-- No GRANT statements here: EXECUTE grants to specific caller roles (which include at least one
-- environment-specific login role name, e.g. TEST's bcb_test_nonstaff_login) are provisioned in
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql and are untouched by this CREATE OR
-- REPLACE -- PostgreSQL preserves a function's existing ACL across a same-signature replace.
