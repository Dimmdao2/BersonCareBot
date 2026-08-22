-- BCB-MIGRATION-OWNER: app_seam_platform_analytics_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_product_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text,text)') IS NOT NULL
--
-- Р-АДМИН (WORK_ORDER §2.3) + условие владельца #1019-Q1 от 26.07. Экран «Приложение» — вкладка
-- глобального админа `/app/doctor/usage` — показывал ИМЕННУЮ таблицу «Клиент»: ФИО, «был в сети» и
-- минуты активности построчно по каждому человеку, плюс диалог по клику на «Активных
-- пользователей» со ссылкой на карточку пациента. Это и есть тот «переход к пациентам» с вкладки
-- «Приложение», из-за которого соседний drill-down стоит закрытым fail-closed. Таблица снята
-- целиком вместе с чтением `platform_users ⋈ user_identity` ради ФИО.
--
-- Снятие таблицы экран не чинило: под `app_platform_settings` он падал 500 и на остальном. У этой
-- роли на `platform_users` есть ровно `SELECT (id, calendar_timezone)`, а на
-- `product_analytics_events_recent`, `product_analytics_user_hourly` и `product_push_notifications`
-- нет НИЧЕГО (замер 22.08.2026 по `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`), то
-- есть 42501 давали и резолв служебных учёток, и все три чтения телеметрии.
--
-- Грант не годится: решение владельца Р-АДМИН — «глобальный админ читает данные аккаунтов и
-- открытые данные… мед данные — не читает», «мне нахуй не нужны какие-то их данные, кроме того, что
-- нужно для моей работы». `product_analytics_user_hourly` — это поминутная активность конкретного
-- человека по страницам кабинета. Дверь отдаёт СЧЁТ: числа и графики на экране появляются, а
-- табличный грант платформенной роли остаётся НУЛЁМ — читать строки людей ей по-прежнему нечем, а
-- не «интерфейс перестал показывать».
--
-- ДВЕРЬ ОДНА НА ЭКРАН (AGENTS §5). Существующие корни переиспользовать нельзя:
--   * `app.read_platform_user_stats` (соседняя ветка, 22.08) считает регистрации, слияния и
--     подписчиков — ни одной величины этого экрана он не отдаёт;
--   * `app.read_platform_analytics_dashboard` считает девятнадцать отношений ради другого экрана и
--     из телеметрии берёт только `page_views`; ни заходов, ни push, ни минут активности в нём нет.
-- Владелец шва — существующий `app_seam_platform_analytics_owner`: ровно он уже владеет обоими
-- соседними корнями и уже читает `product_analytics_user_hourly`. Второго владельца заводить
-- незачем, чужого — нельзя.
--
-- ПОЛИТИКИ В SQL НЕ ПОЯВЛЯЮТСЯ, ОБЕ ПРИЕЗЖАЮТ ПАРАМЕТРОМ:
--   * «кто служебная учётка» — `p_audience_json`, той же формы, что у обоих соседних корней;
--   * «какие ключи страниц схлопываются в одну» — `p_page_groups_json`, СПИСОК правил из
--     `PRODUCT_ANALYTICS_PAGE_GROUP_RULES`, единственного источника этих правил в репозитории.
-- Схлопывание нужно ЗДЕСЬ, а не на стороне приложения, ровно по одной причине:
-- `count(DISTINCT user_id)` обязан считаться ПОСЛЕ схлопывания. Иначе человек, открывший
-- `/app/patient/treatment/:id` и `/app/patient/treatment`, попадёт в «Клиенты» дважды — на DEV
-- 22.08.2026 в эту группу сходятся три из тридцати восьми хранимых ключей, и они же самые частые.
-- Второй копии правил в SQL нет: тело умеет только применить присланный список.
--
-- РАЗБОР ПРАВ КОРНЯ (AGENTS §1 «Перед приземлением миграции»).
-- Тело исполняется владельцем шва `app_seam_platform_analytics_owner`. Читает:
--   1. `public.platform_users` — SELECT (id, role): отсев служебных учёток. Колонки у шва есть.
--   2. `public.user_contacts` — SELECT канонических колонок: телефоны служебных учёток. Есть у шва
--      через CANONICAL_CONTACT_SURFACE_CORRECTIONS; строка для этой двери добавлена в declaration.
--   3. `public.user_channel_bindings` — SELECT (user_id, channel_code, external_id). Есть у шва.
--   4. `public.product_analytics_user_hourly` — SELECT (bucket_hour, user_id, page_key, app_opens,
--      page_views, push_opens, active_minutes). У шва были bucket_hour/user_id/page_key/page_views;
--      `app_opens`, `push_opens`, `active_minutes` добавлены объявлением в этой ветке.
--   5. `public.product_analytics_events_recent` — SELECT (occurred_at, event_type, entry_channel,
--      page_key, topic_code, push_kind, warmup_slogan_key, user_id). НОВОЕ отношение для этого шва:
--      политики `rev10_named_root_owner_gate` / `rev10_seam_business` перечисляют владельцев из
--      декларации, поэтому шов встаёт в них генератором, а не миграцией.
--   6. `public.product_push_notifications` — SELECT (created_at, user_id, topic_code, push_kind,
--      warmup_slogan_key, warmup_slogan_text). Тоже НОВОЕ отношение для этого шва.
-- Записи тело не делает, `FOR UPDATE`/`FOR SHARE` не берёт, новых seam-ролей не вводит, новых
-- таблиц и колонок не заводит — значит и нового индекса на горячую колонку не требуется.
-- EXECUTE получает ровно `app_platform_settings` и ровно через declaration.ts — миграция прав не
-- выдаёт и не отзывает (AGENTS §1).

CREATE OR REPLACE FUNCTION app.read_product_analytics_dashboard(
  p_start timestamp with time zone,
  p_end_exclusive timestamp with time zone,
  p_iana text,
  p_audience_json text,
  p_page_groups_json text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
  v_audience jsonb;
  v_page_groups jsonb;
  v_page_rules jsonb;
  v_scope_prefix text;
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
    'analytics.product-dashboard.read',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg
    ]),
    'app.read_product_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text,text)'::regprocedure
  );

  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start THEN
    RAISE EXCEPTION 'product_analytics_range_invalid' USING ERRCODE = '22023';
  END IF;
  -- Часовой пояс отбивается ЗДЕСЬ, как у обоих соседних корней: неизвестное имя иначе всплыло бы
  -- как 22023 из середины запроса, где его никто не свяжет с параметром.
  IF p_iana IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana) THEN
    RAISE EXCEPTION 'product_analytics_timezone_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_audience := p_audience_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'product_analytics_audience_invalid' USING ERRCODE = '22023';
  END;
  IF v_audience IS NULL OR jsonb_typeof(v_audience) <> 'object' THEN
    RAISE EXCEPTION 'product_analytics_audience_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_page_groups := p_page_groups_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'product_analytics_page_groups_invalid' USING ERRCODE = '22023';
  END;
  IF v_page_groups IS NULL OR jsonb_typeof(v_page_groups) <> 'object'
     OR jsonb_typeof(v_page_groups -> 'rules') <> 'array'
     OR jsonb_typeof(v_page_groups -> 'scopePrefix') <> 'string' THEN
    RAISE EXCEPTION 'product_analytics_page_groups_invalid' USING ERRCODE = '22023';
  END IF;
  v_page_rules := v_page_groups -> 'rules';
  v_scope_prefix := v_page_groups ->> 'scopePrefix';

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

  -- ── Правила схлопывания ключей страниц, как их прислало приложение ───────────────────────────
  page_group_rules AS (
    SELECT t.ordinality AS ord,
           t.rule ->> 'match' AS match_kind,
           t.rule ->> 'value' AS match_value,
           t.rule ->> 'group' AS group_key
      FROM jsonb_array_elements(v_page_rules) WITH ORDINALITY AS t(rule, ordinality)
  ),

  -- ── 1. Часовой ролап событий ────────────────────────────────────────────────────────────────
  -- `__all__` — хранимый в этих таблицах признак «измерение к строке неприменимо»; тело его не
  -- назначает, только повторяет, как повторял прежний код приложения.
  event_rows AS (
    SELECT e.occurred_at AS occurred_at,
           e.event_type AS event_type,
           e.entry_channel AS entry_channel,
           COALESCE(e.page_key, '__all__') AS page_key,
           COALESCE(e.topic_code, '__all__') AS topic_code,
           COALESCE(e.push_kind, '__all__') AS push_kind,
           COALESCE(e.warmup_slogan_key, '__all__') AS warmup_slogan_key
      FROM public.product_analytics_events_recent AS e
     WHERE e.occurred_at >= p_start AND e.occurred_at < p_end_exclusive
       AND (e.user_id IS NULL OR e.user_id <> ALL (SELECT id FROM excluded_users))
  ),
  push_rows AS (
    SELECT n.created_at AS created_at,
           COALESCE(n.topic_code, '__all__') AS topic_code,
           COALESCE(n.push_kind, '__all__') AS push_kind,
           COALESCE(n.warmup_slogan_key, '__all__') AS warmup_slogan_key,
           n.warmup_slogan_key AS raw_slogan_key,
           n.warmup_slogan_text AS warmup_slogan_text,
           n.push_kind AS raw_push_kind
      FROM public.product_push_notifications AS n
     WHERE n.created_at >= p_start AND n.created_at < p_end_exclusive
       AND n.user_id <> ALL (SELECT id FROM excluded_users)
  ),
  -- Час считается в UTC — ровно как `truncateToUtcHour` в приложении; в локальный пояс бакет
  -- переводит уже экран. `date_trunc` по timestamptz зависел бы от TimeZone сессии, поэтому
  -- момент сначала приводится к UTC.
  hourly AS (
    SELECT u.bucket_hour AS bucket_hour, u.event_type AS event_type,
           u.entry_channel AS entry_channel, u.page_key AS page_key, u.topic_code AS topic_code,
           u.push_kind AS push_kind, u.warmup_slogan_key AS warmup_slogan_key,
           count(*)::bigint AS event_count
      FROM (
        SELECT to_char(date_trunc('hour', e.occurred_at AT TIME ZONE 'UTC'),
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS bucket_hour,
               e.event_type, e.entry_channel, e.page_key, e.topic_code, e.push_kind,
               e.warmup_slogan_key
          FROM event_rows AS e
        UNION ALL
        SELECT to_char(date_trunc('hour', p.created_at AT TIME ZONE 'UTC'),
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
               'push_sent', '__all__', '__all__', p.topic_code, p.push_kind, p.warmup_slogan_key
          FROM push_rows AS p) AS u
     GROUP BY 1, 2, 3, 4, 5, 6, 7
  ),
  warmup_samples AS (
    SELECT DISTINCT ON (p.raw_slogan_key)
           p.raw_slogan_key AS slogan_key, p.warmup_slogan_text AS sample_text
      FROM push_rows AS p
     WHERE p.raw_push_kind = 'warmup' AND p.raw_slogan_key IS NOT NULL
     ORDER BY p.raw_slogan_key, p.created_at
  ),

  -- ── 2. Величины про людей — только счёт ─────────────────────────────────────────────────────
  user_rows AS (
    SELECT h.bucket_hour AS bucket_hour, h.user_id AS user_id, h.page_key AS page_key,
           h.app_opens AS app_opens, h.page_views AS page_views, h.push_opens AS push_opens,
           h.active_minutes AS active_minutes
      FROM public.product_analytics_user_hourly AS h
     WHERE h.bucket_hour >= p_start AND h.bucket_hour < p_end_exclusive
       AND h.user_id <> ALL (SELECT id FROM excluded_users)
  ),
  user_page_keys AS (SELECT DISTINCT btrim(r.page_key) AS page_key FROM user_rows AS r),
  -- Первое совпавшее правило и останавливает перебор: `group` = null значит «правило совпало, ключ
  -- оставить как есть», и это НЕ то же самое, что «ни одно правило не совпало».
  user_page_groups AS (
    SELECT k.page_key AS page_key,
           CASE WHEN NOT starts_with(k.page_key, v_scope_prefix) THEN k.page_key
                ELSE COALESCE(m.group_key, k.page_key) END AS group_key
      FROM user_page_keys AS k
      LEFT JOIN LATERAL (
        SELECT g.group_key AS group_key
          FROM page_group_rules AS g
         WHERE (g.match_kind = 'exact' AND k.page_key = g.match_value)
            OR (g.match_kind = 'prefix' AND starts_with(k.page_key, g.match_value))
         ORDER BY g.ord
         LIMIT 1) AS m ON true
  ),
  active_rows AS (
    SELECT r.bucket_hour AS bucket_hour, r.user_id AS user_id, r.page_views AS page_views,
           btrim(r.page_key) AS page_key
      FROM user_rows AS r
     WHERE (r.app_opens + r.page_views + r.push_opens + r.active_minutes) > 0
  ),
  active_page_rows AS (
    SELECT a.bucket_hour AS bucket_hour, a.user_id AS user_id, g.group_key AS group_key
      FROM active_rows AS a
      JOIN user_page_groups AS g ON g.page_key = a.page_key
     WHERE a.page_key <> '__all__' AND a.page_views > 0
  ),
  active_users_daily AS (
    SELECT (timezone(p_iana, a.bucket_hour))::date::text AS day,
           count(DISTINCT a.user_id) AS n
      FROM active_rows AS a GROUP BY 1
  ),
  page_unique_users AS (
    SELECT a.group_key AS page_key, count(DISTINCT a.user_id) AS n
      FROM active_page_rows AS a GROUP BY 1
  ),
  page_unique_users_hourly AS (
    SELECT to_char(date_trunc('hour', timezone(p_iana, a.bucket_hour)),
                   'YYYY-MM-DD"T"HH24:00:00') AS bucket,
           a.group_key AS page_key, count(DISTINCT a.user_id) AS n
      FROM active_page_rows AS a GROUP BY 1, 2
  )

  SELECT jsonb_build_object(
    'hourly', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bucketHour', h.bucket_hour, 'eventType', h.event_type, 'entryChannel', h.entry_channel,
        'pageKey', h.page_key, 'topicCode', h.topic_code, 'pushKind', h.push_kind,
        'warmupSloganKey', h.warmup_slogan_key, 'eventCount', h.event_count)), '[]'::jsonb)
      FROM hourly AS h),
    'warmupSloganSamples', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sloganKey', w.slogan_key, 'sampleText', w.sample_text)), '[]'::jsonb)
      FROM warmup_samples AS w),
    'userAggregates', jsonb_build_object(
      'totalActiveMinutes', (SELECT COALESCE(sum(r.active_minutes), 0)::bigint FROM user_rows AS r),
      'uniqueActiveUsers', (SELECT count(DISTINCT a.user_id) FROM active_rows AS a),
      'activeUsersDaily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'day', d.day, 'activeUsers', d.n)), '[]'::jsonb) FROM active_users_daily AS d),
      'pageUniqueUsers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'pageKey', u.page_key, 'uniqueUsers', u.n)), '[]'::jsonb) FROM page_unique_users AS u),
      'pageUniqueUsersHourly', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'bucket', b.bucket, 'pageKey', b.page_key, 'uniqueUsers', b.n)), '[]'::jsonb)
        FROM page_unique_users_hourly AS b)
    )
  ) INTO v_result;

  RETURN v_result;
END
$function$
;
