-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'provider_requirement') > 0 AND pg_catalog.strpos(p.prosrc, 'oauth_yandex_enabled') > 0 AND pg_catalog.strpos(p.prosrc, 'oauth_google_enabled') > 0 AND pg_catalog.strpos(p.prosrc, 'oauth_apple_enabled') > 0 AND pg_catalog.strpos(p.prosrc, 'oauth_vk_enabled') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_public_runtime_setting(text,text)')
--
-- The single-root migration correctly removed the physical runtime projection rows, but its public
-- reader still tried to read the four OAuth "configured" projections as stored rows. Derive all
-- four from their restricted system_settings sources at read time, as the retired projection
-- trigger did, without restoring a second row or write path.
--
-- Rights analysis: this replaces one existing SECURITY DEFINER function under its existing seam
-- owner and caller. The body still SELECTs only public.system_settings(key, scope,
-- organization_id, value_json), already declared for app_seam_settings_runtime_owner. It creates
-- no relation, role, policy or grant and requires no new privilege declaration.
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

  IF p_scope = 'admin'
     AND p_key IN (
       'oauth_yandex_enabled', 'oauth_google_enabled',
       'oauth_apple_enabled', 'oauth_vk_enabled'
     ) THEN
    RETURN QUERY
    WITH provider_requirement(projection_key, source_key) AS (
      VALUES
        ('oauth_yandex_enabled', 'yandex_oauth_client_id'),
        ('oauth_yandex_enabled', 'yandex_oauth_client_secret'),
        ('oauth_yandex_enabled', 'yandex_oauth_redirect_uri'),
        ('oauth_google_enabled', 'google_client_id'),
        ('oauth_google_enabled', 'google_client_secret'),
        ('oauth_google_enabled', 'google_oauth_login_redirect_uri'),
        ('oauth_apple_enabled', 'apple_oauth_client_id'),
        ('oauth_apple_enabled', 'apple_oauth_redirect_uri'),
        ('oauth_apple_enabled', 'apple_oauth_team_id'),
        ('oauth_apple_enabled', 'apple_oauth_key_id'),
        ('oauth_apple_enabled', 'apple_oauth_private_key'),
        ('oauth_vk_enabled', 'vk_id_application_id'),
        ('oauth_vk_enabled', 'vk_id_client_secret'),
        ('oauth_vk_enabled', 'vk_id_redirect_uri')
    )
    SELECT p_key, p_scope, NULL::uuid, 'public'::text,
           pg_catalog.jsonb_build_object(
             'value',
             pg_catalog.count(*) FILTER (
               WHERE pg_catalog.jsonb_typeof(setting.value_json -> 'value') = 'string'
                 AND NULLIF(pg_catalog.btrim(setting.value_json ->> 'value'), '') IS NOT NULL
             ) = pg_catalog.count(*)
           )
      FROM provider_requirement requirement
      LEFT JOIN public.system_settings setting
        ON setting.key = requirement.source_key
       AND setting.scope = 'admin'
       AND setting.organization_id IS NULL
     WHERE requirement.projection_key = p_key;
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
         'auth_oauth_apple_enabled', 'auth_passkey_enabled', 'specialist_signup_enabled',
         'patient_unsupported_client_fallback_enabled', 'telegram_login_bot_username',
         'max_login_bot_nickname', 'vk_web_login_url', 'support_contact_url', 'app_display_timezone'
       )
       OR setting.key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled$'
     )
   LIMIT 1;
END
$function$;
