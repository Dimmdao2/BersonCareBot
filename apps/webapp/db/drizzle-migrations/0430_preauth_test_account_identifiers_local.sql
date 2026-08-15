-- BCB-MIGRATION-OWNER: app_seam_settings_preauth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0430
-- 0430_preauth_test_account_identifiers_local
--
-- The owner-approved TEST patient password walkthrough is decided before a session exists. The
-- bootstrap login has no direct SELECT on system_settings, so expose this one non-secret allowlist
-- through the existing fixed-key pre-session capability. Production behavior remains fail-closed:
-- without the configured row, the accessor returns NULL and patient password login stays disabled.

CREATE OR REPLACE FUNCTION app.read_webapp_preauth_provider_setting(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'config.preauth-provider.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg
    ]), 'app.read_webapp_preauth_provider_setting(text)'::regprocedure
  );
  SELECT setting.value_json INTO value
    FROM public.system_settings AS setting
   WHERE p_key IN (
      'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
      'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
      'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
      'apple_oauth_key_id', 'apple_oauth_private_key',
      'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri',
      'telegram_bot_token',
      'test_account_identifiers'
    )
     AND setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN value;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_preauth_owner
COMMENT ON FUNCTION app.read_webapp_preauth_provider_setting(text) IS
  'Fixed-key server capability for pre-login provider credentials and the TEST account allowlist; the bootstrap login receives no system_settings table access.';
