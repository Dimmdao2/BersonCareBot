-- BCB-MIGRATION-OWNER: app_seam_settings_preauth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('jitsi_jwt_signing_secret' in pg_get_functiondef('app.read_webapp_preauth_provider_setting(text)'::regprocedure)) > 0;
--
-- The meeting provider runs for staff, patients and anonymous guests, none of which may SELECT the
-- global restricted settings table. Extend the existing fixed-key server-side provider door with
-- the five Jitsi keys; callers still receive no relation grant and the SQL allowlist remains the
-- final authority over which restricted values can leave this SECURITY DEFINER seam.
CREATE OR REPLACE FUNCTION app.read_webapp_preauth_provider_setting(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.preauth-provider.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_webapp_preauth_provider_setting(text)'::regprocedure);

  SELECT setting.value_json INTO value
    FROM public.system_settings AS setting
   WHERE p_key IN (
      'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
      'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
      'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
      'apple_oauth_key_id', 'apple_oauth_private_key',
      'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri',
      'telegram_bot_token',
      'test_account_identifiers',
      'jitsi_public_url', 'jitsi_jwt_issuer', 'jitsi_jwt_application_id',
      'jitsi_jwt_signing_secret', 'jitsi_xmpp_domain'
    )
     AND setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN value;
END
$function$;
