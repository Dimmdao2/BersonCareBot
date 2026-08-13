-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Register the platform-wide material-rating switch in the server runtime projection. Patient
-- handlers read only this reviewed boolean through the existing exact server-config root; the
-- restricted system_settings table remains closed to app_patient.
CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner', 'app_pre_session', 'pre_session',
    'config.runtime.server.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('text@1', textsend(p_scope))::app.port_typed_arg
    ]), 'app.read_webapp_server_runtime_setting(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
    FROM public.app_runtime_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.audience = 'server'
     AND setting.key IN (
       'debug_forward_to_admin', 'video_presign_ttl_seconds',
       'material_ratings_enabled',
       'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
       'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones', 'auth_2fa_enabled'
     )
   LIMIT 1;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'material_ratings_enabled',
  'admin',
  NULL,
  'server',
  COALESCE(setting.value_json, '{"value":false}'::jsonb),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM (SELECT 1) AS seed
LEFT JOIN public.system_settings AS setting
  ON setting.key = 'material_ratings_enabled'
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience;
