-- 0245_public_app_base_url_runtime_setting: the anonymous landing page served the ENV fallback
-- instead of the configured `app_base_url`, and poisoned that value for authenticated consumers.
--
-- MEASURED ON DEV (bcb_webapp_dev, 2026-07-26), before this migration:
--   system_settings.app_base_url = {"value": "https://test.bersoncare.ru"}
--   curl http://127.0.0.1:5200/ -> <meta property="og:url" content="http://127.0.0.1:5200">
--
-- ROOT CAUSE. `src/app/page.tsx` (public, pre-authentication) calls getAppBaseUrl() ->
-- modules/system-settings/integrationRuntime.ts -> configAdapter.ts::getConfigValue("app_base_url")
-- -> infra/repos/pgSystemSettings.ts::readAdminSystemSettingString, which is a bare
-- `SELECT ... FROM system_settings`. An anonymous request carries no principal, so
-- choosePoolKindForPrincipal routes it to the NONSTAFF pool and applySignedDbPrincipal answers with
-- release_principal_context() + RESET ROLE: the query runs as the bare `bcb_*_nonstaff_login`, which
-- holds no SELECT on system_settings, and raises 42501. getConfigValue's `catch` turns that denial
-- into `null` and substitutes the env fallback -- so the page does not 500, it silently serves a
-- DIFFERENT origin than the configured one. It then stores that substitute in the process-global
-- 60-second cache keyed by setting name alone, where every other consumer in the process reads it:
-- api/clinic/invites (invite links), sendBookingConfirmationEmail, api/auth/oauth/callback/*,
-- patientWebPushNotify, intakeNotificationRelay. One anonymous GET / therefore sent authenticated
-- e-mails out with the wrong origin for the next ~60 seconds.
--
-- FIX (this migration is the DATA half; the code half moves the read onto the accessor). There is
-- already a sanctioned public read path for exactly this: the `public.app_runtime_settings`
-- projection plus `app.read_public_runtime_setting(p_key, p_scope)`, the SECURITY DEFINER accessor
-- introduced by 0193_e1_safe_runtime_config.sql and executable by the anonymous login role. Four of
-- the five "public" config reads in the product already use it (app_display_timezone and the
-- provider-enabled booleans). `app_base_url` was simply never registered in the projection, which
-- is why the landing had to fall back to the restricted table. This registers it, seeded from
-- system_settings, exactly as 0193 registers app_display_timezone.
--
-- The accessor itself is NOT touched: unlike app.read_webapp_server_runtime_setting it carries no
-- key allowlist -- it serves any global row whose audience is 'public'. No new function, so
-- `expected_secdef_count` in deploy/host/deploy-test-saas.sh is unchanged. No new GRANT: EXECUTE on
-- the accessor is already provisioned in deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql.
--
-- DISCLOSURE. `app_base_url` is the product's own public origin -- it is in the address bar of every
-- visitor and in every absolute link the app emits. Projecting it to audience 'public' reveals
-- nothing that an anonymous visitor does not already hold. It is not a credential; the restricted
-- keys in system_settings (bot tokens, OAuth client secrets) are not touched by this migration.
--
-- ONGOING SYNC. public.sync_registered_app_runtime_setting() (0193) mirrors any system_settings
-- write into app_runtime_settings for keys ALREADY registered there, preserving the registered
-- audience. Registering the key here is therefore all that is needed for the admin settings UI to
-- keep updating it; no trigger change.
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'app_base_url',
  'admin',
  NULL,
  'public',
  COALESCE(setting.value_json, '{"value":""}'::jsonb),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM (SELECT 1) AS anchor
LEFT JOIN public.system_settings AS setting
  ON setting.key = 'app_base_url'
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
