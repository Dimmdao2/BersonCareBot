-- BCB-MIGRATION-OWNER: app_seam_platform_analytics_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0043
--
-- Замер 19.08, живой запрос под настоящей сессией глобального админа на DEV:
--   GET /api/admin/platform-analytics?preset=week  -->  HTTP 500
--   bcb_dev_webapp_global_admin@bcb_webapp_dev 42501 ERROR: permission denied for table
--     be_specialists / product_analytics_hourly / product_analytics_user_hourly /
--     be_appointments / treatment_program_instances / clinical_visit / content_pages /
--     content_sections / lfk_exercises / lfk_exercise_media / media_files /
--     program_action_log / symptom_entries / symptom_trackings /
--     media_playback_resolution_events / media_playback_client_events /
--     media_hls_proxy_error_events
-- Перебор всех девятнадцати таблиц под ролью страницы, по одной, тем же способом:
--   BEGIN; SET LOCAL ROLE app_platform_settings; SELECT count(*) FROM public.<t>; ROLLBACK;
-- дал 42501 на СЕМНАДЦАТИ из девятнадцати. Прошли только `be_organizations` и `platform_users`,
-- и те упёрлись в «accepted port context required», то есть в контекст, а не в привилегию.
--
-- Чего это стоит человеку. `pgPlatformAnalytics` читал отношения напрямую, а сервис собирал их в
-- ГОЛЫЙ `Promise.all`: первый же 42501 ронял ВЕСЬ дашборд. Глобальный админ не видел ни одной
-- цифры — ни клиник, ни записей, ни объёма видео, — а видел «Не удалось загрузить аналитику.».
-- Не «часть блоков пустая», а страница целиком.
--
-- Почему дверь, а не грант. Расширять грант `app_platform_settings` на семнадцать таблиц нельзя
-- дважды: во-первых, `deploy-test-saas.sh` ассертит точный набор прав каждой роли; во-вторых,
-- решение владельца D1 (08.08, `privileges/README.md`) — «глобал админ не лезет в медицину».
-- Семнадцать таблиц включают `clinical_visit`, `symptom_entries`, `program_action_log` — ровно
-- медицину. Объявленный корень снимает противоречие целиком: строк медицинских данных роль не
-- получает НИКОГДА, она получает СЧЁТ. Это же и есть решение владельца от 26.07 «платформенная
-- аналитика — только агрегаты» и от 19.08 «подключить то, что уже есть в данных».
--
-- Почему ОДИН корень, а не восемь. Три причины, каждая измерена:
--   1. Тридцать операторов на рендер шли в пул `globalAdminPool` с `max: 1`
--      (`webappPoolProvider.ts:350`) — то есть строго по очереди, и `Promise.all` не давал ничего.
--      Замер того же рендера по журналу Postgres: 421 оператор на один заход, потому что КАЖДЫЙ
--      запрос обёрнут своей port-context-транзакцией (`begin_port_context` +
--      `pre_session_resolve_identity` + запрос + `clear_port_context`). Один корень — один заход.
--   2. Одна страница с одним контролом периода — это ОДИН снимок. Восемь корней означали бы
--      восемь моментов времени и цифры, которые не сходятся между собой.
--   3. Одна дверь — одна capability, один грант EXECUTE, один call-site в каталоге. Восемь
--      дверей — восемь поверхностей ревью ради одного экрана.
--
-- Отсечение тестовых учёток приходит СПИСКОМ ИДЕНТИФИКАТОРОВ, а решение «кого считать тестовым»
-- остаётся в приложении (`modules/analytics/analyticsAudience.ts`, одно на все поверхности).
-- Резолв идентификаторов в id живёт здесь только потому, что `platform_users.role`,
-- `platform_users.phone_normalized` и `user_channel_bindings` платформенной роли не видны.
--
-- Заходы считаются по `product_analytics_user_hourly`, а не по `product_analytics_hourly`:
-- только у первой есть `user_id`, без которого тестовые учётки не отсечь. Цена — анонимные
-- заходы в разрез не попадают; продуктовая аналитика собирается в кабинете пациента, который
-- целиком за логином, поэтому потеря здесь пустая.

CREATE OR REPLACE FUNCTION app.read_platform_analytics_dashboard(
  p_start timestamp with time zone,
  p_end_exclusive timestamp with time zone,
  p_iana text,
  p_audience_json text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
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
  PERFORM app.require_accepted_context(
    'app_seam_platform_analytics_owner'::name,
    'app_platform_settings'::name,
    'platform'::app.port_context_class,
    'analytics.platform-dashboard.read',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_start))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_end_exclusive))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_iana))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_audience_json))::app.port_typed_arg
    ]),
    'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)'::regprocedure
  );

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
        OR (cardinality(v_excluded_phones) > 0 AND u.phone_normalized = ANY(v_excluded_phones))
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
    SELECT r.user_id AS user_id, r.media_id AS media_id, r.delivery AS delivery,
           (timezone(p_iana, r.resolved_at))::date::text AS d
      FROM public.media_playback_resolution_events AS r
     WHERE r.resolved_at >= p_start AND r.resolved_at < p_end_exclusive
       AND (r.user_id IS NULL OR r.user_id NOT IN (SELECT id FROM excluded_users))
  ),
  playback AS (
    -- `count(DISTINCT (user_id, media_id))` вместо склейки в текст: при `user_id IS NULL` склейка
    -- давала NULL, и анонимный просмотр входил во «всего», но исчезал из «уникальных».
    SELECT count(*) AS views_total,
           count(DISTINCT (user_id, media_id)) AS views_unique,
           count(*) FILTER (WHERE delivery = 'hls') AS hls_resolves,
           count(*) FILTER (WHERE delivery = 'mp4') AS mp4_resolves
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
                                   'hlsResolves', playback.hls_resolves,
                                   'mp4Resolves', playback.mp4_resolves,
                                   'playbackErrors', playback_errors.n,
                                   'byDay', playback_by_day.m)
  ) INTO snapshot
  FROM clinics, clinics_by_day, specialists, specialists_by_day, patients, patients_by_day,
       page_views, bookings, programs_assigned, clinical_visits, cms_articles, exercises,
       exercise_media_urls, empty_volume, completions, home_wellbeing,
       program_activity, playback, playback_by_day, playback_errors;

  RETURN snapshot;
END
$function$;

-- Прав в этой миграции нет и быть не может: `GRANT`, `REVOKE` и любое иное изменение прав в файле
-- миграции запрещены полностью (AGENTS.md §1 «Миграция не выдаёт и не отзывает права. Никогда»).
-- Отзыв у PUBLIC и единственный GRANT EXECUTE приходят следующим шагом того же прогона — из
-- `deploy/postgres/generated/privileges.<база>.sql`, который применяет reconcile.
-- Тут это ещё и единственный работающий порядок: владелец шва `app_seam_platform_analytics_owner`
-- рождается вместе с этой работой, имеет временный CREATE на схему `app`, но не USAGE — разрешить
-- имя функции в REVOKE он не может, и прогон падает на `permission denied for schema app`
-- (проверено на dev 19.08).
