-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0050
--
-- Живой проход владельца по TEST 19.08 23:15: «новое видео - не прикрепляется, ни плейсхолдера,
-- ни реакции - тишина», и рядом старое видео вечно висит с заглушкой «Видео готовится», хотя по
-- клику открывается настоящий файл. Фото при этом загружается нормально — путь превью другой.
--
-- Обе находки — одно и то же: видео на TEST не пересобирается с 18.08 19:26. Воркер медиа падает
-- раз в 5 секунд, его собственный журнал бесполезен (`{"level":50,"err":{"type":"Error"}}` без
-- текста), а в журнале PostgreSQL:
--
--   2026-08-19 23:12:40 bcb_test_webapp_staff@bersoncarebot_test 42501
--   ERROR:  accepted organization context required
--   CONTEXT: PL/pgSQL function current_org_id() line 7 at RAISE
--   STATEMENT: SELECT j.id, j.media_id, j.organization_id … FROM public.media_transcode_jobs j …
--
-- Почему это не могло работать вообще НИКОГДА, а не «сломалось вчера». Роль у диспетчера верная:
-- маршрут `api/internal/media-worker/control:POST` входит инфра-принципалом и получает
-- `app_operational_media_worker` (`webapp_media_relation`). Но на `public.media_transcode_jobs`
-- ЕДИНСТВЕННАЯ разрешающая политика этой роли — `rev10_saas_org_dormant_p0_8_4`, а её предикат
-- целиком про арендатора:
--
--   (current_user = 'app_staff' AND (SELECT app.current_org_id()) IS NOT NULL AND organization_id = …)
--   OR (app.current_patient_user_id() IS NOT NULL AND organization_id = (SELECT app.current_org_id()) AND …)
--
-- Ветки воркера в ней нет (перепись прав знает это как именованное исключение I11 — «фильтр
-- воркера на ENQUEUE, не в RLS»), поэтому ни один дизъюнкт роли воркера не подходит. Хуже: обе
-- ветки зовут `app.current_org_id()` подзапросом, то есть InitPlan'ом, который планировщик считает
-- ОДИН раз независимо от порядка AND, а сама `app.current_org_id()` принимает контекст только
-- ролей `app_staff | app_clinic_billing | app_patient | app_integrator_request | app_tenant_service
-- | app_worker` и на любой другой роли не возвращает NULL, а поднимает 42501. Диспетчер очереди
-- межарендный по построению: одного `organization_id` у него нет и быть не может — предъявить
-- контекст, который бы устроил этот предикат, он не может в принципе.
--
-- Класс ровно тот же, что закрывали сегодня для очереди доставки (`fix(delivery)`) и машинных
-- тиков оператора (`fix(operator)`): ФИЛЬТР СТЕНЫ СТОИТ НА ПОСТАНОВКЕ В ОЧЕРЕДЬ — она уже стоит,
-- это `app.enqueue_media_transcode_job_for_staff/_for_service` от того же шва, — А РАЗБОР ОЧЕРЕДИ
-- ЕСТЬ РАБОТА ИНФРАСТРУКТУРНОЙ РОЛИ ЗА ОБЪЯВЛЕННЫМ КОРНЕМ. Здесь заводятся три двери, по одной на
-- шаг оборота воркера: взять работу, прочитать её файл, записать исход. Владелец шва — тот же
-- `app_seam_patient_lfk_media_owner`, что уже владеет постановкой в эту очередь; EXECUTE — только
-- у `app_operational_media_worker`. Ни одной табличной привилегии рабочим ролям не добавляется:
-- прямые гранты `app_operational_media_worker` на `public.media_transcode_jobs` снимаются вовсе —
-- они были мёртвыми ровно потому, что политика роли неудовлетворима.
--
-- Стена никуда не делась: инвариант «организация работы совпадает с организацией файла» стоял в
-- этом же методе и перенесён в тело КАЖДОГО из трёх корней, а работа с несовпадением по-прежнему
-- отбивается в `failed` с `organization_invariant_violation`. Владение работой (`status =
-- 'processing'`, `locked_by` = мой замок) проверяется телом, а не вызывающим.

CREATE OR REPLACE FUNCTION app.claim_media_transcode_job(
  p_locked_by text,
  p_stale_lock_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_candidate record;
  v_claimed record;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner'::name,
    'app_operational_media_worker'::name,
    'service'::app.port_context_class,
    'media.transcode.claim',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_locked_by))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_stale_lock_minutes))::app.port_typed_arg
    ]),
    'app.claim_media_transcode_job(text,integer)'::regprocedure
  );

  IF p_locked_by IS NULL OR pg_catalog.btrim(p_locked_by) = '' THEN
    RAISE EXCEPTION 'media_transcode_claim_locked_by_invalid' USING ERRCODE = '22023';
  END IF;
  -- Верхняя граница окна протухшего замка закрыта ЗДЕСЬ: «сколько ждать чужой замок» отпирает
  -- чужую работу и не может быть свободным числом от вызывающего.
  IF p_stale_lock_minutes IS NULL OR p_stale_lock_minutes < 1 OR p_stale_lock_minutes > 1440 THEN
    RAISE EXCEPTION 'media_transcode_claim_stale_lock_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.media_transcode_jobs AS stale
     SET status = 'pending',
         locked_at = NULL,
         locked_by = NULL,
         processing_started_at = NULL,
         finished_at = NULL,
         updated_at = now(),
         last_error = COALESCE(stale.last_error, '') || ' [stale_lock_reclaimed]'
   WHERE stale.status = 'processing'
     AND stale.locked_at IS NOT NULL
     AND stale.locked_at < now() - (p_stale_lock_minutes * interval '1 minute');

  SELECT job.id AS id,
         job.media_id AS media_id,
         job.organization_id AS job_organization_id,
         media.organization_id AS media_organization_id
    INTO v_candidate
    FROM public.media_transcode_jobs AS job
    LEFT JOIN public.media_files AS media
      ON media.id = job.media_id
   WHERE job.status = 'pending'
     AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
   ORDER BY job.created_at ASC
   LIMIT 1
     FOR UPDATE OF job SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'idle');
  END IF;

  -- Стена этого пути: работа и файл обязаны принадлежать ОДНОЙ организации. Несовпадение — не
  -- повод пропустить строку молча: она отбивается в `failed`, иначе диспетчер будет вечно
  -- натыкаться на неё и не двигать очередь.
  IF v_candidate.job_organization_id IS NULL
     OR v_candidate.media_organization_id IS NULL
     OR v_candidate.job_organization_id <> v_candidate.media_organization_id THEN
    UPDATE public.media_transcode_jobs AS broken
       SET status = 'failed',
           attempts = broken.attempts + 1,
           locked_at = now(),
           locked_by = p_locked_by,
           last_error = 'organization_invariant_violation',
           next_attempt_at = NULL,
           processing_started_at = NULL,
           finished_at = now(),
           updated_at = now()
     WHERE broken.id = v_candidate.id
       AND broken.status = 'pending';
    RETURN jsonb_build_object('kind', 'idle');
  END IF;

  UPDATE public.media_transcode_jobs AS taken
     SET status = 'processing',
         locked_at = now(),
         locked_by = p_locked_by,
         attempts = taken.attempts + 1,
         processing_started_at = now(),
         finished_at = NULL,
         updated_at = now()
   WHERE taken.id = v_candidate.id
     AND taken.status = 'pending'
  RETURNING taken.id, taken.media_id, taken.organization_id, taken.attempts
       INTO v_claimed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'idle');
  END IF;

  RETURN jsonb_build_object(
    'kind', 'claimed',
    'job', jsonb_build_object(
      'id', v_claimed.id::text,
      'mediaId', v_claimed.media_id::text,
      'organizationId', v_claimed.organization_id::text,
      'attempts', v_claimed.attempts
    )
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Вторая дверь: воркер читает файл СВОЕЙ взятой работы. Возвращает SQL NULL, если работа не в
-- `processing`, взята не этим замком или организация работы разошлась с организацией файла —
-- то есть тот же ответ «нечего делать», что и раньше, но решение принимает тело корня.

CREATE OR REPLACE FUNCTION app.read_media_transcode_job_media(
  p_job_id uuid,
  p_media_id uuid,
  p_locked_by text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner'::name,
    'app_operational_media_worker'::name,
    'service'::app.port_context_class,
    'media.transcode.job-media.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_job_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_media_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_locked_by))::app.port_typed_arg
    ]),
    'app.read_media_transcode_job_media(uuid,uuid,text)'::regprocedure
  );

  SELECT jsonb_build_object(
           'id', media.id::text,
           'mimeType', media.mime_type,
           's3Key', media.s3_key,
           'hlsMasterPlaylistS3Key', media.hls_master_playlist_s3_key,
           'videoProcessingStatus', media.video_processing_status,
           'videoDurationSeconds', media.video_duration_seconds,
           'usagePurpose', media.usage_purpose
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

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Третья дверь: воркер записывает, чем кончился его оборот. Исход выбирается параметром из
-- ЗАКРЫТОГО списка внутри тела — ровно как у соседа `app.prune_retention_target(text,integer,
-- boolean)`; каждый исход сохраняет своё поведение, общей у них только эта дверь. Строка работы
-- берётся `FOR UPDATE` под тем же владением, что проверял прежний `withOwnedProcessingJob`:
-- не моя работа — `false`, и вызывающий поднимает `media_worker_control_conflict`, как раньше.

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
             video_delivery_override = 'mp4',
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
