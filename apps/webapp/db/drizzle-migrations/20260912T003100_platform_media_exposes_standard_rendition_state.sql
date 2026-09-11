-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.read_platform_media_row(uuid)'::regprocedure) LIKE '%standard_rendition_at%';
-- Возвращаемый набор колонок меняется, поэтому DROP + CREATE: `CREATE OR REPLACE` не умеет менять
-- OUT-колонки. Сигнатура аргументов та же, `regprocedure` идентичен.
DROP FUNCTION app.read_platform_media_row(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
CREATE OR REPLACE FUNCTION app.read_platform_media_row(p_media_id uuid)
 RETURNS TABLE(id text, mime_type text, s3_key text, stored_path text, status text, usage_purpose text, uploaded_by text, video_processing_status text, hls_master_playlist_s3_key text, poster_s3_key text, video_duration_seconds integer, available_qualities_json jsonb, preview_sm_key text, preview_md_key text, preview_status text, standard_rendition_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_patient_lfk_media_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT
    id::text,
    mime_type,
    s3_key,
    stored_path,
    status,
    usage_purpose,
    uploaded_by::text,
    video_processing_status,
    hls_master_playlist_s3_key,
    poster_s3_key,
    video_duration_seconds,
    available_qualities_json,
    preview_sm_key,
    preview_md_key,
    preview_status,
    standard_rendition_at
  FROM public.media_files
  WHERE id = p_media_id
    AND owner_kind = 'platform'
    AND organization_id IS NULL
    AND (status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))
$function$;
