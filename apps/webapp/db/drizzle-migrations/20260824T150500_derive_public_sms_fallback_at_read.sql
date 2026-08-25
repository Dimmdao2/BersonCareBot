-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_public_runtime_setting(text,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'setting.key = ''sms_fallback_enabled''') > 0 AND pg_catalog.strpos(p.prosrc, 'public_sms_fallback_enabled') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_public_runtime_setting(text,text)')
-- The public SMS capability is a safe projection of the restricted source setting, not a second
-- stored setting. The single-root cutover removed the runtime mirror but left this reader looking
-- for the old projection key as a physical row. Resolve the projection at read time from the one
-- remaining system_settings root. Missing or malformed source values stay fail-closed as false.
--
-- Rights analysis: this replaces one existing SECURITY DEFINER function under its existing seam
-- owner. Its only relation read remains public.system_settings and uses the already declared SELECT
-- columns key, scope, organization_id and value_json. No object, role, policy or privilege changes.
CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)
 RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_sms_fallback_enabled boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_runtime_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.runtime.public.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_public_runtime_setting(text,text)'::regprocedure);

  IF p_key = 'public_sms_fallback_enabled' AND p_scope = 'admin' THEN
    SELECT CASE pg_catalog.lower(setting.value_json ->> 'value')
             WHEN 'true' THEN true
             WHEN '1' THEN true
             WHEN 'false' THEN false
             WHEN '0' THEN false
             ELSE NULL
           END
      INTO v_sms_fallback_enabled
      FROM public.system_settings setting
     WHERE setting.key = 'sms_fallback_enabled'
       AND setting.organization_id IS NULL
       AND setting.scope IN ('doctor', 'admin')
     ORDER BY CASE setting.scope WHEN 'doctor' THEN 0 ELSE 1 END
     LIMIT 1;

    RETURN QUERY
    SELECT p_key, p_scope, NULL::uuid, 'public'::text,
           pg_catalog.jsonb_build_object('value', COALESCE(v_sms_fallback_enabled, false));
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, 'public'::text AS audience, setting.value_json
    FROM public.system_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND (
       setting.key IN (
         'auth_email_enabled', 'auth_sms_enabled', 'auth_telegram_enabled', 'auth_max_enabled',
         'auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_oauth_vk_enabled',
         'auth_oauth_apple_enabled', 'auth_passkey_enabled', 'oauth_yandex_enabled',
         'oauth_google_enabled', 'oauth_apple_enabled', 'oauth_vk_enabled',
         'specialist_signup_enabled', 'patient_unsupported_client_fallback_enabled',
         'telegram_login_bot_username', 'max_login_bot_nickname', 'vk_web_login_url',
         'support_contact_url', 'app_display_timezone'
       )
       OR setting.key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled$'
     )
   LIMIT 1;
END
$function$;
