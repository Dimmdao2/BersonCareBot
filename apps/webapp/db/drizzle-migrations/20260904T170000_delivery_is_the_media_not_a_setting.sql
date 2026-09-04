-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) FROM information_schema.columns WHERE (table_schema, table_name, column_name) IN (('public', 'media_files', 'video_delivery_override'), ('public', 'media_playback_resolution_events', 'fallback_used'), ('public', 'media_playback_stats_hourly', 'fallback_count'))) = 0 AND NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'video_default_delivery') AND to_regprocedure('app.record_media_playback_resolution_event(uuid,uuid,text,boolean)') IS NULL AND to_regprocedure('app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)') IS NULL AND to_regprocedure('app.record_media_playback_resolution_event(uuid,uuid,text)') IS NOT NULL AND to_regprocedure('app.increment_media_playback_resolution_stat(uuid,uuid,text)') IS NOT NULL
--
-- Решение владельца 04.09.2026: переключатели стратегии выдачи видео и весь MP4-fallback после
-- готового HLS — устаревшие. Транскод удаляет исходный объект `media_files.s3_key` сразу после
-- успешной сборки HLS (`apps/media-worker/src/processTranscodeJob.ts`), поэтому «запасной» MP4 для
-- HLS-готового ряда указывал на удалённый объект: это не запас, а сломанный путь.
--
-- После этой миграции маршрут задаёт само медиа, а не настройка:
--   не видео                         → progressive `file`;
--   видео с готовым HLS              → только HLS;
--   видео без готового HLS           → progressive MP4 (сюда же попадает
--                                      `usage_purpose = 'program_item_submission'`: его исход
--                                      `done_program` обнуляет `hls_master_playlist_s3_key`,
--                                      поэтому отдельный per-file override ему не нужен).
--
-- Уходят три поверхности:
--   1. `media_files.video_delivery_override` — единственным писателем был исход `done_program`,
--      который тут же гасил HLS-ключи; читателем — резолвер плейбека. Оба сняты.
--   2. `fallback_used` / `fallback_count` — счётчик события, которого больше не существует.
--   3. `system_settings.video_default_delivery` — глобальная стратегия mp4/hls/auto.
--
-- Телеметрия ошибок HLS (`media_playback_client_events`, `media_hls_proxy_error_events`) и колонка
-- `delivery` (какой путь фактически отдали; часть ключа почасового агрегата) остаются.

ALTER TABLE public.media_playback_resolution_events
  DROP COLUMN fallback_used;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_playback_stats_hourly
  DROP COLUMN fallback_count;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- `media_files_video_delivery_override_check` уходит вместе с колонкой.
ALTER TABLE public.media_files
  DROP COLUMN video_delivery_override;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Глобальной стратегии выдачи больше нет: ключ снят с реестра настроек в этой же ветке.
DELETE FROM public.system_settings WHERE key = 'video_default_delivery';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Три аргумента вместо четырёх: `p_fallback_used` описывал снятое событие.
CREATE OR REPLACE FUNCTION app.record_media_playback_resolution_event(p_user_id uuid, p_media_id uuid, p_delivery text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_media_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  -- Do not accept caller-supplied p_user_id as proof of a staff actor. Until the signed
  -- context carries a staff id, staff/org-only/integrator contexts are all denied here.
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_resolution_events
    (organization_id, user_id, media_id, delivery)
  VALUES
    (v_organization_id, p_user_id, p_media_id, p_delivery);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_media_owner
DROP FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.increment_media_playback_resolution_stat(p_user_id uuid, p_media_id uuid, p_delivery text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_media_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_stats_hourly (
    organization_id, bucket_hour, delivery, resolved_count
  ) VALUES (
    v_organization_id,
    date_trunc('hour', clock_timestamp()),
    p_delivery,
    1
  )
  ON CONFLICT (organization_id, bucket_hour, delivery) DO UPDATE
    SET resolved_count = public.media_playback_stats_hourly.resolved_count + 1;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_media_owner
DROP FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: saas_system_health_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- Снимок здоровья больше не сравнивает HLS с MP4 и не считает fallback: остаются «сколько выдач»
-- и «сколько уникальных пар (пользователь, видео) увидели первую выдачу в окне».
CREATE OR REPLACE FUNCTION app.read_curated_playback_health_pre_0196()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH windows(hours) AS (VALUES (24), (1)),
event_totals AS (
  SELECT
    windows.hours,
    count(events.*) AS total
  FROM windows
  LEFT JOIN public.media_playback_resolution_events AS events
    ON events.resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
hourly_totals AS (
  SELECT
    windows.hours,
    COALESCE(sum(stats.resolved_count), 0) AS total
  FROM windows
  LEFT JOIN public.media_playback_stats_hourly AS stats
    ON stats.bucket_hour >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
unique_totals AS (
  SELECT windows.hours, count(first_resolve.*) AS unique_pairs
  FROM windows
  LEFT JOIN public.media_playback_user_video_first_resolve AS first_resolve
    ON first_resolve.first_resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
)
SELECT jsonb_object_agg(
  event_totals.hours::text,
  jsonb_build_object(
    'totalResolutions', CASE WHEN event_totals.total > 0 THEN event_totals.total ELSE hourly_totals.total END,
    'uniquePlaybackPairsFirstSeenInWindow', unique_totals.unique_pairs
  )
)
FROM event_totals
JOIN hourly_totals USING (hours)
JOIN unique_totals USING (hours)
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- Возвращаемый набор колонок меняется, поэтому DROP + CREATE: `CREATE OR REPLACE` не умеет менять
-- OUT-колонки. Сигнатура аргументов та же, `regprocedure` идентичен.
DROP FUNCTION app.read_platform_media_row(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
CREATE OR REPLACE FUNCTION app.read_platform_media_row(p_media_id uuid)
 RETURNS TABLE(id text, mime_type text, s3_key text, stored_path text, status text, usage_purpose text, uploaded_by text, video_processing_status text, hls_master_playlist_s3_key text, poster_s3_key text, video_duration_seconds integer, available_qualities_json jsonb, preview_sm_key text, preview_md_key text, preview_status text)
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
    preview_status
  FROM public.media_files
  WHERE id = p_media_id
    AND owner_kind = 'platform'
    AND organization_id IS NULL
    AND (status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Исход `done_program` больше не выставляет `video_delivery_override`: он и так обнуляет
-- `hls_master_playlist_s3_key`, а без готового HLS резолвер отдаёт progressive MP4 сам.
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Дверь загрузки submission-видео тоже перестаёт писать снятую колонку: назначение уже записано в
-- `usage_purpose`, а прогрессивный маршрут выводится из отсутствия готового HLS.
CREATE OR REPLACE FUNCTION app.create_patient_program_submission_media(p_media_id uuid, p_filename text, p_key text, p_mime_type text, p_size_bytes bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_root_id uuid;
  v_folder_id uuid;
  v_display_name text;
  v_fallback_name text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_lfk_media_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.media.program-submission.create', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($5))::app.port_typed_arg]), 'app.create_patient_program_submission_media(uuid,text,text,text,bigint)'::regprocedure);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RAISE EXCEPTION 'patient_organization_context_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
     WHERE enrollment.organization_id = v_organization_id
       AND enrollment.platform_user_id = v_patient_user_id
       AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_patient_enrollment_required' USING ERRCODE = '42501';
  END IF;
  IF p_media_id IS NULL OR p_filename IS NULL OR btrim(p_filename) = ''
     OR p_key IS NULL OR btrim(p_key) = '' OR p_size_bytes IS NULL
     OR p_size_bytes <= 0 OR p_size_bytes > 262144000
     OR lower(btrim(p_mime_type)) NOT IN (
       'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
       'video/mp4', 'video/quicktime', 'video/webm'
     ) THEN
    RAISE EXCEPTION 'invalid_patient_program_submission_media' USING ERRCODE = '22023';
  END IF;

  SELECT folder.id INTO v_folder_id
    FROM public.media_folders AS folder
   WHERE folder.kind = 'client_patient'
     AND folder.patient_user_id = v_patient_user_id
     AND folder.organization_id = v_organization_id
   LIMIT 1;

  IF v_folder_id IS NULL THEN
    SELECT folder.id INTO v_root_id
      FROM public.media_folders AS folder
     WHERE folder.kind = 'client_files_root'
       AND folder.organization_id = v_organization_id
     LIMIT 1;

    IF v_root_id IS NULL THEN
      INSERT INTO public.media_folders (organization_id, parent_id, name, kind)
      VALUES (v_organization_id, NULL, 'Пациенты', 'client_files_root')
      RETURNING id INTO v_root_id;
    END IF;

    SELECT left(COALESCE(
      NULLIF(btrim(concat_ws(' ', identity.last_name, identity.first_name, identity.patronymic)), ''),
      NULLIF(btrim(identity.display_name), ''),
      'Клиент'
    ), 180)
      INTO v_display_name
      FROM public.user_identity AS identity
     WHERE identity.platform_user_id = v_patient_user_id;
    v_display_name := COALESCE(v_display_name, 'Клиент');
    v_fallback_name := left(v_display_name || ' · ' || left(v_patient_user_id::text, 8), 180);

    BEGIN
      INSERT INTO public.media_folders (
        organization_id, parent_id, name, kind, patient_user_id
      ) VALUES (
        v_organization_id, v_root_id, v_display_name, 'client_patient', v_patient_user_id
      )
      RETURNING id INTO v_folder_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT folder.id INTO v_folder_id
        FROM public.media_folders AS folder
       WHERE folder.kind = 'client_patient'
         AND folder.patient_user_id = v_patient_user_id
         AND folder.organization_id = v_organization_id
       LIMIT 1;
      IF v_folder_id IS NULL THEN
        INSERT INTO public.media_folders (
          organization_id, parent_id, name, kind, patient_user_id
        ) VALUES (
          v_organization_id, v_root_id, v_fallback_name, 'client_patient', v_patient_user_id
        )
        RETURNING id INTO v_folder_id;
      END IF;
    END;
  END IF;

  INSERT INTO public.media_files (
    id, owner_kind, organization_id, original_name, stored_path, mime_type, size_bytes,
    uploaded_by, s3_key, status, folder_id, usage_purpose
  ) VALUES (
    p_media_id, 'organization', v_organization_id, p_filename, p_key, lower(btrim(p_mime_type)),
    p_size_bytes, v_patient_user_id, p_key, 'pending', v_folder_id,
    'program_item_submission'
  );
  RETURN true;
END
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_platform_analytics_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Платформенный дашборд больше не публикует `hlsResolves`/`mp4Resolves`.
CREATE OR REPLACE FUNCTION app.read_platform_analytics_dashboard(p_start timestamp with time zone, p_end_exclusive timestamp with time zone, p_iana text, p_audience_json text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  snapshot jsonb;
  v_audience jsonb;
  v_exclude_staff boolean;
  v_staff_roles text[];
  v_excluded_phones text[];
  v_telegram_ids text[];
  v_max_ids text[];
BEGIN
  PERFORM app.require_accepted_context('app_seam_platform_analytics_owner'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'analytics.platform-dashboard.read', app.hash_port_typed_args(ARRAY[ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)'::regprocedure);

  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start THEN
    RAISE EXCEPTION 'platform_analytics_range_invalid' USING ERRCODE = '22023';
  END IF;
  -- Часовой пояс отбивается ЗДЕСЬ: неизвестное имя иначе всплыло бы как 22023 из середины
  -- запроса, где его никто не свяжет с параметром.
  IF p_iana IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana) THEN
    RAISE EXCEPTION 'platform_analytics_timezone_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_audience := p_audience_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'platform_analytics_audience_invalid' USING ERRCODE = '22023';
  END;
  IF v_audience IS NULL OR jsonb_typeof(v_audience) <> 'object' THEN
    RAISE EXCEPTION 'platform_analytics_audience_invalid' USING ERRCODE = '22023';
  END IF;

  v_exclude_staff := COALESCE((v_audience ->> 'excludeStaffRoles')::boolean, false);
  v_staff_roles := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'staffRoles')), ARRAY[]::text[]);
  v_excluded_phones := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'excludedPhones')), ARRAY[]::text[]);
  v_telegram_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'telegramIds')), ARRAY[]::text[]);
  v_max_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'maxIds')), ARRAY[]::text[]);

  WITH excluded_users AS (
    SELECT u.id AS id
      FROM public.platform_users AS u
     WHERE (v_exclude_staff AND u.role = ANY(v_staff_roles))
        OR EXISTS (
          SELECT 1 FROM public.user_contacts AS contact
          WHERE contact.platform_user_id = u.id
            AND contact.contact_kind = 'phone'
            AND cardinality(v_excluded_phones) > 0
            AND contact.value_normalized = ANY(v_excluded_phones)
        )
    UNION
    SELECT b.user_id AS id
      FROM public.user_channel_bindings AS b
     WHERE (b.channel_code = 'telegram' AND cardinality(v_telegram_ids) > 0
              AND b.external_id = ANY(v_telegram_ids))
        OR (b.channel_code = 'max' AND cardinality(v_max_ids) > 0
              AND b.external_id = ANY(v_max_ids))
  ),

  -- ── 1. Клиенты платформы ────────────────────────────────────────────────────────────────────
  clinics AS (
    SELECT count(*) FILTER (WHERE o.is_active) AS now_count,
           count(*) FILTER (WHERE o.created_at >= p_start AND o.created_at < p_end_exclusive)
             AS period_count
      FROM public.be_organizations AS o
  ),
  clinics_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, o.created_at))::date::text AS d, count(*) AS n
        FROM public.be_organizations AS o
       WHERE o.created_at >= p_start AND o.created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),
  specialists AS (
    SELECT count(*) FILTER (WHERE s.is_active) AS now_count,
           count(*) FILTER (WHERE s.created_at >= p_start AND s.created_at < p_end_exclusive)
             AS period_count
      FROM public.be_specialists AS s
  ),
  specialists_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, s.created_at))::date::text AS d, count(*) AS n
        FROM public.be_specialists AS s
       WHERE s.created_at >= p_start AND s.created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),
  -- Пациент считается по ОДНОМУ правилу и в «сейчас», и в срезе периода. Прежний код фильтровал
  -- `is_archived` только в «сейчас», и две карточки на одном экране считались по разным правилам.
  patient_rows AS (
    SELECT u.created_at AS created_at
      FROM public.platform_users AS u
     WHERE u.role = 'client'
       AND u.merged_into_id IS NULL
       AND u.is_archived = false
       AND u.id NOT IN (SELECT id FROM excluded_users)
  ),
  patients AS (
    SELECT count(*) AS now_count,
           count(*) FILTER (WHERE created_at >= p_start AND created_at < p_end_exclusive)
             AS period_count
      FROM patient_rows
  ),
  patients_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, created_at))::date::text AS d, count(*) AS n
        FROM patient_rows
       WHERE created_at >= p_start AND created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),

  -- ── 2. Заходы ───────────────────────────────────────────────────────────────────────────────
  page_views AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'pageKey', page_key, 'entryChannel', entry_channel, 'views', views)), '[]'::jsonb) AS a
      FROM (
        SELECT h.page_key AS page_key, h.entry_channel AS entry_channel,
               sum(h.page_views)::bigint AS views
          FROM public.product_analytics_user_hourly AS h
         WHERE h.bucket_hour >= p_start AND h.bucket_hour < p_end_exclusive
           AND h.page_views > 0
           AND h.user_id NOT IN (SELECT id FROM excluded_users)
         GROUP BY 1, 2) AS g
  ),

  -- ── 3. Записались / отменили ────────────────────────────────────────────────────────────────
  bookings AS (
    SELECT count(*) FILTER (
             WHERE a.created_at >= p_start AND a.created_at < p_end_exclusive) AS created_count,
           count(*) FILTER (
             WHERE a.status IN ('cancelled_by_patient', 'cancelled_by_specialist', 'late_cancellation')
               AND a.updated_at >= p_start AND a.updated_at < p_end_exclusive) AS cancelled_count
      FROM public.be_appointments AS a
     WHERE a.deleted_at IS NULL
  ),

  -- ── 4. Программы и визиты с карточками ──────────────────────────────────────────────────────
  programs_assigned AS (
    SELECT count(*) AS n FROM public.treatment_program_instances AS i
     WHERE i.created_at >= p_start AND i.created_at < p_end_exclusive
  ),
  clinical_visits AS (
    SELECT count(*) AS n FROM public.clinical_visit AS v
     WHERE v.created_at >= p_start AND v.created_at < p_end_exclusive
  ),

  -- ── 5. CMS статьи, не разминки ──────────────────────────────────────────────────────────────
  cms_pages AS (
    SELECT p.created_at AS created_at, p.video_url AS video_url
      FROM public.content_pages AS p
      JOIN public.content_sections AS s ON s.slug = p.section
     WHERE p.deleted_at IS NULL
       AND (s.system_parent_code IS NULL OR s.system_parent_code <> 'warmups')
  ),
  cms_articles AS (
    SELECT count(*) AS n FROM cms_pages
     WHERE created_at >= p_start AND created_at < p_end_exclusive
  ),

  -- ── 6. Упражнения специалистов ──────────────────────────────────────────────────────────────
  period_exercises AS (
    SELECT e.id AS id, e.created_by AS created_by, e.catalog_scope AS catalog_scope
      FROM public.lfk_exercises AS e
     WHERE e.owner_kind = 'organization'
       AND e.created_at >= p_start AND e.created_at < p_end_exclusive
  ),
  exercises AS (
    SELECT count(*) AS created_count,
           count(DISTINCT created_by) AS creator_count,
           count(*) FILTER (WHERE catalog_scope = 'personal') AS personal_count,
           count(*) FILTER (WHERE catalog_scope = 'catalog') AS catalog_count
      FROM period_exercises
  ),
  -- Классификация URL (файл vs YouTube/RuTube/VK/Vimeo) — ОДНА, в `hostingUrlKind.ts`. Дублировать
  -- её regex-ами в SQL значило бы завести вторую копию правила, которая разъедется с первой,
  -- поэтому наружу отдаются пары «url → сколько», а не готовый счёт: их столько, сколько РАЗНЫХ
  -- адресов за период, а не сколько строк.
  exercise_media_urls AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('url', media_url, 'count', n)), '[]'::jsonb) AS a
      FROM (
        SELECT m.media_url AS media_url, count(*) AS n
          FROM public.lfk_exercise_media AS m
          JOIN period_exercises AS e ON e.id = m.exercise_id
         WHERE m.media_type = 'video'
         GROUP BY 1) AS g
  ),

  -- ── 7. Объём видео ──────────────────────────────────────────────────────────────────────────
  -- Медиа-id извлекается ОДИН раз и сразу как `uuid`, поэтому join идёт по первичному ключу и
  -- индекс по `media_files.id` работает. Прежний `media_files.id::text = substring(...)` приводил
  -- ключ к тексту и заставлял планировщик протаскивать всю `media_files`. Строгий шаблон uuid в
  -- `WHERE` гарантирует, что `::uuid` не встретит невалидную строку.
  exercise_media_ids AS (
    SELECT DISTINCT
           (substring(m.media_url from '/api/media/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid AS media_id
      FROM public.lfk_exercise_media AS m
      JOIN period_exercises AS e ON e.id = m.exercise_id
     WHERE m.media_type = 'video'
       AND m.media_url ~ '/api/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  ),
  cms_media_ids AS (
    SELECT DISTINCT
           (substring(c.video_url from '/api/media/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid AS media_id
      FROM cms_pages AS c
     WHERE c.created_at >= p_start AND c.created_at < p_end_exclusive
       AND c.video_url ~ '/api/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  ),
  -- Сумма байт и ступени длительности считаются ОДНИМ оператором. Прежний код тянул по строке на
  -- каждый медиафайл и складывал их в JS, то есть объём трафика рос вместе с библиотекой.
  volume_rows AS (
    SELECT 'exercises'::text AS src, f.size_bytes AS size_bytes,
           f.video_duration_seconds AS duration_seconds
      FROM public.media_files AS f
      JOIN exercise_media_ids AS m ON m.media_id = f.id
    UNION ALL
    SELECT 'cms'::text AS src, f.size_bytes AS size_bytes,
           f.video_duration_seconds AS duration_seconds
      FROM public.media_files AS f
      JOIN cms_media_ids AS m ON m.media_id = f.id
  ),
  -- Ступени владельца: до 3 / 3–5 / 5–7 / 7–10 / 10–15 / 15–20 минут. Ролик без длительности —
  -- ОТДЕЛЬНАЯ корзина, а не «до 3»: иначе «коротких» роликов оказывается тем больше, чем хуже
  -- отработал media-worker.
  volumes AS (
    SELECT src, jsonb_build_object(
             'originalsBytes', COALESCE(sum(size_bytes), 0),
             'videoCount', count(*),
             'durationBuckets', jsonb_build_object(
               'le3', count(*) FILTER (WHERE duration_seconds BETWEEN 0 AND 180),
               'm3_5', count(*) FILTER (WHERE duration_seconds > 180 AND duration_seconds <= 300),
               'm5_7', count(*) FILTER (WHERE duration_seconds > 300 AND duration_seconds <= 420),
               'm7_10', count(*) FILTER (WHERE duration_seconds > 420 AND duration_seconds <= 600),
               'm10_15', count(*) FILTER (WHERE duration_seconds > 600 AND duration_seconds <= 900),
               'm15_20', count(*) FILTER (WHERE duration_seconds > 900 AND duration_seconds <= 1200),
               'over20', count(*) FILTER (WHERE duration_seconds > 1200),
               'unknown', count(*) FILTER (WHERE duration_seconds IS NULL OR duration_seconds < 0)
             )) AS v
      FROM volume_rows
     GROUP BY src
  ),
  empty_volume AS (
    SELECT jsonb_build_object('originalsBytes', 0, 'videoCount', 0,
             'durationBuckets', jsonb_build_object('le3', 0, 'm3_5', 0, 'm5_7', 0, 'm7_10', 0,
               'm10_15', 0, 'm15_20', 0, 'over20', 0, 'unknown', 0)) AS v
  ),

  -- ── 8. Активность пациентов ─────────────────────────────────────────────────────────────────
  completions AS (
    SELECT count(*) AS n,
           count(*) FILTER (
             WHERE (l.payload ->> 'reps') IS NOT NULL
                OR (l.payload ->> 'perceivedDifficulty') IS NOT NULL
                OR (l.payload ->> 'difficulty') IS NOT NULL) AS with_metrics
      FROM public.program_action_log AS l
     WHERE l.action_type = 'done'
       AND l.created_at >= p_start AND l.created_at < p_end_exclusive
       AND l.patient_user_id NOT IN (SELECT id FROM excluded_users)
  ),
  home_wellbeing AS (
    SELECT count(*) AS n
      FROM public.symptom_entries AS e
      JOIN public.symptom_trackings AS t ON t.id = e.tracking_id
     WHERE t.symptom_key = 'general_wellbeing'
       AND e.recorded_at >= p_start AND e.recorded_at < p_end_exclusive
  ),
  active_instances AS (
    SELECT i.id AS id, i.patient_user_id AS patient_user_id
      FROM public.treatment_program_instances AS i
     WHERE i.status = 'active'
       AND i.patient_user_id NOT IN (SELECT id FROM excluded_users)
  ),
  program_activity AS (
    SELECT (SELECT count(DISTINCT patient_user_id) FROM active_instances) AS patients_with_program,
           (SELECT count(*) FROM (
              SELECT DISTINCT h.user_id, (timezone(p_iana, h.bucket_hour))::date AS d
                FROM public.product_analytics_user_hourly AS h
                JOIN active_instances AS a ON a.patient_user_id = h.user_id
               WHERE h.bucket_hour >= p_start AND h.bucket_hour < p_end_exclusive
                 AND h.page_views > 0
                 AND h.page_key LIKE '/app/patient/treatment%') AS x) AS visit_days,
           (SELECT count(*) FROM (
              SELECT DISTINCT l.patient_user_id, (timezone(p_iana, l.created_at))::date AS d
                FROM public.program_action_log AS l
                JOIN active_instances AS a ON a.id = l.instance_id
               WHERE l.action_type = 'done'
                 AND l.created_at >= p_start AND l.created_at < p_end_exclusive) AS x) AS mark_days
  ),
  playback_events AS (
    SELECT r.user_id AS user_id, r.media_id AS media_id,
           (timezone(p_iana, r.resolved_at))::date::text AS d
      FROM public.media_playback_resolution_events AS r
     WHERE r.resolved_at >= p_start AND r.resolved_at < p_end_exclusive
       AND (r.user_id IS NULL OR r.user_id NOT IN (SELECT id FROM excluded_users))
  ),
  playback AS (
    -- `count(DISTINCT (user_id, media_id))` вместо склейки в текст: при `user_id IS NULL` склейка
    -- давала NULL, и анонимный просмотр входил во «всего», но исчезал из «уникальных».
    SELECT count(*) AS views_total,
           count(DISTINCT (user_id, media_id)) AS views_unique
      FROM playback_events
  ),
  playback_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT d, count(*) AS n FROM playback_events GROUP BY 1) AS g
  ),
  playback_errors AS (
    SELECT (SELECT count(*) FROM public.media_playback_client_events AS c
             WHERE c.created_at >= p_start AND c.created_at < p_end_exclusive)
         + (SELECT count(*) FROM public.media_hls_proxy_error_events AS x
             WHERE x.created_at >= p_start AND x.created_at < p_end_exclusive) AS n
  )

  SELECT jsonb_build_object(
    'clinics', jsonb_build_object('now', clinics.now_count, 'inPeriod', clinics.period_count,
                                  'byDay', clinics_by_day.m),
    'specialists', jsonb_build_object('now', specialists.now_count,
                                      'inPeriod', specialists.period_count,
                                      'byDay', specialists_by_day.m),
    'patients', jsonb_build_object('now', patients.now_count, 'inPeriod', patients.period_count,
                                   'byDay', patients_by_day.m),
    'pageViews', page_views.a,
    'bookings', jsonb_build_object('created', bookings.created_count,
                                   'cancelled', bookings.cancelled_count),
    'programsAssigned', programs_assigned.n,
    'clinicalVisits', clinical_visits.n,
    'cmsArticlesCreated', cms_articles.n,
    'exercises', jsonb_build_object('created', exercises.created_count,
                                    'creators', exercises.creator_count,
                                    'personal', exercises.personal_count,
                                    'catalog', exercises.catalog_count,
                                    'mediaUrls', exercise_media_urls.a),
    'videoVolumeExercises', COALESCE((SELECT v FROM volumes WHERE src = 'exercises'),
                                     empty_volume.v),
    'videoVolumeCms', COALESCE((SELECT v FROM volumes WHERE src = 'cms'), empty_volume.v),
    'completions', jsonb_build_object('completions', completions.n,
                                      'withRepsOrDifficulty', completions.with_metrics),
    'homeWellbeingMarks', home_wellbeing.n,
    'programActivity', jsonb_build_object(
      'patientsWithProgram', program_activity.patients_with_program,
      'visitDaysSum', program_activity.visit_days,
      'markDaysSum', program_activity.mark_days),
    'playback', jsonb_build_object('viewsTotal', playback.views_total,
                                   'viewsUnique', playback.views_unique,
                                   'playbackErrors', playback_errors.n,
                                   'byDay', playback_by_day.m)
  ) INTO snapshot
  FROM clinics, clinics_by_day, specialists, specialists_by_day, patients, patients_by_day,
       page_views, bookings, programs_assigned, clinical_visits, cms_articles, exercises,
       exercise_media_urls, empty_volume, completions, home_wellbeing,
       program_activity, playback, playback_by_day, playback_errors;

  RETURN snapshot;
END
$function$
;
