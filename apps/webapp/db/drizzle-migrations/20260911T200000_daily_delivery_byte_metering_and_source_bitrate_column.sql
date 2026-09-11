-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.media_playback_delivery_daily') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.media_files') AND NOT a.attisdropped AND a.attname = 'source_bitrate_bps') AND position('source_bitrate_bps' in pg_catalog.pg_get_functiondef('app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)'::regprocedure)) > 0
--
-- VIDEO_DELIVERY_COST_AND_METERING (11.09.2026, docs/_TODO/VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md):
-- «счётчик данных надо ставить, надо ставить по-любому» + «желательно... сколько открытий видео...
-- объём выданного трафика», и отдельно «какое видео отдаётся каким битрейтом».
--
-- Требование 1 — счётчик выданных HLS-байт. `hlsDeliveryProxy.ts` accumulates every delivered
-- response in an in-memory batch (`hlsDeliveryByteMeter.ts`, dozens of segments per view — no
-- `INSERT` per segment by design) and a maintenance job (`media.delivery_bytes.flush`, every 5 min)
-- drains it here additively. Grants/RLS: `deploy/postgres/privileges/declaration.ts` —
-- `app_operational_maintenance` only, same `current_user` wall as the sibling telemetry tables.
ALTER TABLE public.media_files
  ADD COLUMN source_bitrate_bps integer,
  ADD CONSTRAINT media_files_source_bitrate_bps_check
    CHECK (source_bitrate_bps IS NULL OR source_bitrate_bps >= 0);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.media_files.source_bitrate_bps IS
  'Measured source container bitrate (bits/sec), one ffprobe call alongside duration (wt/encoding-mode, probeVideoDimensions -> MediaWorkerControlPort.doneHls). NULL = not measured (legacy row or probe could not read it) — normal, not an error.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Daily rollup keyed (day, org, patient, video, quality) — «разрез по видео» и «по качеству»
-- обязательные ключи (owner), не опция. No per-request writer exists: the sole reader/writer/deleter
-- is the maintenance role (declaration.ts), so there is no patient/staff branch to wall off here —
-- unlike `media_playback_resolution_events`, patients and staff never touch this table directly.
CREATE TABLE public.media_playback_delivery_daily (
    bucket_date date NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    quality text NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    bytes_total bigint DEFAULT 0 NOT NULL,
    CONSTRAINT media_playback_delivery_daily_request_count_check CHECK (request_count >= 0),
    CONSTRAINT media_playback_delivery_daily_bytes_total_check CHECK (bytes_total >= 0),
    CONSTRAINT media_playback_delivery_daily_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
    CONSTRAINT media_playback_delivery_daily_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE,
    CONSTRAINT media_playback_delivery_daily_media_id_fkey
      FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX media_playback_delivery_daily_org_user_media_quality_uidx
  ON public.media_playback_delivery_daily
  USING btree (bucket_date, organization_id, user_id, media_id, quality);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_media_playback_delivery_daily_bucket
  ON public.media_playback_delivery_daily USING btree (bucket_date DESC);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_media_playback_delivery_daily_media_bucket
  ON public.media_playback_delivery_daily USING btree (media_id, bucket_date DESC);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_media_playback_delivery_daily_organization_id
  ON public.media_playback_delivery_daily USING btree (organization_id);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Требование 2 — принимающая сторона битрейта исходника. `wt/encoding-mode` already measures it and
-- sends it in `doneHls`'s payload (`sourceBitrateBps`); this closed-list door is the only writer of
-- `media_files`, so the `done_hls` branch is where it lands. Same `CASE` shape, one more `COALESCE`.
CREATE OR REPLACE FUNCTION app.record_media_transcode_job_outcome(
  p_job_id uuid,
  p_media_id uuid,
  p_locked_by text,
  p_outcome text,
  p_payload_json text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_owned uuid;
  v_payload jsonb;
  v_error text;
  v_next_attempt_at timestamptz;
  v_qualities jsonb;
  v_output_key text;
  v_poster_key text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner'::name,
    'app_operational_media_worker'::name,
    'service'::app.port_context_class,
    'media.transcode.outcome.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_job_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_media_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_locked_by))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_outcome))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_payload_json))::app.port_typed_arg
    ]),
    'app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)'::regprocedure
  );

  v_payload := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_payload_json, '')), ''), '{}')::jsonb;

  SELECT job.id
    INTO v_owned
    FROM public.media_transcode_jobs AS job
    JOIN public.media_files AS media
      ON media.id = job.media_id
   WHERE job.id = p_job_id
     AND job.media_id = p_media_id
     AND job.status = 'processing'
     AND job.locked_by = p_locked_by
     AND job.organization_id = media.organization_id
     FOR UPDATE OF job;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- ЗАКРЫТЫЙ СПИСОК. Ветка добавляется только вместе с объявленной поверхностью в
  -- deploy/postgres/privileges/declaration.ts; всё остальное отказывает ниже в ELSE.
  CASE p_outcome
    WHEN 'processing' THEN
      UPDATE public.media_files AS media
         SET video_processing_status = 'processing',
             video_processing_error = NULL
       WHERE media.id = p_media_id;

    WHEN 'retry' THEN
      v_error := v_payload ->> 'error';
      v_next_attempt_at := (v_payload ->> 'nextAttemptAt')::timestamptz;
      IF v_next_attempt_at IS NULL THEN
        RAISE EXCEPTION 'media_transcode_outcome_next_attempt_required' USING ERRCODE = '22023';
      END IF;
      UPDATE public.media_transcode_jobs AS job
         SET status = 'pending',
             last_error = v_error,
             next_attempt_at = v_next_attempt_at,
             locked_at = NULL,
             locked_by = NULL,
             processing_started_at = NULL,
             finished_at = NULL,
             updated_at = now()
       WHERE job.id = p_job_id;
      UPDATE public.media_files AS media
         SET video_processing_status = 'pending',
             video_processing_error = v_error
       WHERE media.id = p_media_id;

    WHEN 'failed' THEN
      v_error := v_payload ->> 'error';
      UPDATE public.media_transcode_jobs AS job
         SET status = 'failed',
             last_error = v_error,
             locked_at = NULL,
             locked_by = NULL,
             next_attempt_at = NULL,
             finished_at = now(),
             updated_at = now()
       WHERE job.id = p_job_id;
      UPDATE public.media_files AS media
         SET video_processing_status = 'failed',
             video_processing_error = v_error
       WHERE media.id = p_media_id;

    WHEN 'done_hls' THEN
      UPDATE public.media_files AS media
         SET video_processing_status = 'ready',
             video_processing_error = NULL,
             hls_master_playlist_s3_key = COALESCE(
               v_payload ->> 'masterKey', media.hls_master_playlist_s3_key),
             hls_artifact_prefix = COALESCE(
               v_payload ->> 'artifactPrefix', media.hls_artifact_prefix),
             poster_s3_key = COALESCE(v_payload ->> 'posterKey', media.poster_s3_key),
             available_qualities_json = COALESCE(
               (v_payload ->> 'qualitiesJson')::jsonb, media.available_qualities_json),
             video_duration_seconds = COALESCE(
               (v_payload ->> 'durationSeconds')::double precision::integer,
               media.video_duration_seconds),
             source_bitrate_bps = COALESCE(
               (v_payload ->> 'sourceBitrateBps')::double precision::integer,
               media.source_bitrate_bps)
       WHERE media.id = p_media_id;
      UPDATE public.media_transcode_jobs AS job
         SET status = 'done',
             locked_at = NULL,
             locked_by = NULL,
             last_error = NULL,
             finished_at = now(),
             updated_at = now()
       WHERE job.id = p_job_id;

    WHEN 'done_program' THEN
      v_output_key := v_payload ->> 'outputKey';
      v_poster_key := v_payload ->> 'posterKey';
      v_qualities := (v_payload ->> 'qualitiesJson')::jsonb;
      IF v_output_key IS NULL OR v_poster_key IS NULL OR v_qualities IS NULL THEN
        RAISE EXCEPTION 'media_transcode_outcome_program_payload_invalid' USING ERRCODE = '22023';
      END IF;
      UPDATE public.media_files AS media
         SET s3_key = v_output_key,
             mime_type = 'video/mp4',
             video_processing_status = 'ready',
             video_processing_error = NULL,
             available_qualities_json = v_qualities,
             hls_master_playlist_s3_key = NULL,
             hls_artifact_prefix = NULL,
             poster_s3_key = v_poster_key,
             video_duration_seconds = COALESCE(
               (v_payload ->> 'durationSeconds')::double precision::integer,
               media.video_duration_seconds)
       WHERE media.id = p_media_id;
      UPDATE public.media_transcode_jobs AS job
         SET status = 'done',
             locked_at = NULL,
             locked_by = NULL,
             last_error = NULL,
             finished_at = now(),
             updated_at = now()
       WHERE job.id = p_job_id;

    ELSE
      RAISE EXCEPTION 'media_transcode_outcome_unknown' USING ERRCODE = '22023';
  END CASE;

  RETURN true;
END
$function$;
