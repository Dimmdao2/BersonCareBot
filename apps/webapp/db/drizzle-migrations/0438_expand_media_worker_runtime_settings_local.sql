-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0438
-- Media cron routes use the exact media-worker capability and therefore read
-- only the fixed, non-secret runtime keys exposed by this definer root.

CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN (
      'video_hls_pipeline_enabled', 'video_hls_reconcile_enabled',
      'video_hls_new_uploads_auto_transcode', 'video_watermark_enabled',
      'error_tracking_enabled', 'error_tracking_dsn'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

ALTER FUNCTION app.read_media_worker_runtime_setting(text) OWNER TO app_seam_settings_runtime_owner;
REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM PUBLIC;
