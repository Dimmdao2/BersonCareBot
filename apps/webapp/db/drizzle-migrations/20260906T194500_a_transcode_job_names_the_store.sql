-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_media_transcode_job_media(uuid,uuid,text)'::regprocedure) LIKE '%''storageTarget'', media.storage_target%'
--
-- Пересборку видео делает отдельная служба (apps/media-worker): она скачивает исходник, кладёт
-- рядом HLS и постер и удаляет исходный MP4. Всё это — в бакете, который ей назвали. Видео,
-- записанное пациентом по программе, живёт в шифрованном хранилище, поэтому наряд на работу
-- обязан называть хранилище строки, а не подразумевать библиотечное.

CREATE OR REPLACE FUNCTION app.read_media_transcode_job_media(p_job_id uuid, p_media_id uuid, p_locked_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_lfk_media_owner'::name, 'app_operational_media_worker'::name, 'service'::app.port_context_class, 'media.transcode.job-media.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.read_media_transcode_job_media(uuid,uuid,text)'::regprocedure);

  SELECT jsonb_build_object(
           'id', media.id::text,
           'mimeType', media.mime_type,
           's3Key', media.s3_key,
           'hlsMasterPlaylistS3Key', media.hls_master_playlist_s3_key,
           'videoProcessingStatus', media.video_processing_status,
           'videoDurationSeconds', media.video_duration_seconds,
           'usagePurpose', media.usage_purpose,
           'storageTarget', media.storage_target
         )
    INTO v_result
    FROM public.media_transcode_jobs AS job
    JOIN public.media_files AS media
      ON media.id = job.media_id
   WHERE job.id = p_job_id
     AND job.media_id = p_media_id
     AND job.status = 'processing'
     AND job.locked_by = p_locked_by
     AND job.organization_id = media.organization_id;

  RETURN v_result;
END
$function$;
