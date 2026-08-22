-- BCB-MIGRATION-OWNER: app_seam_platform_analytics_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_platform_user_stats(timestamp with time zone,timestamp with time zone,text,text)') IS NOT NULL
--
-- Р-АДМИН (WORK_ORDER §2.3). Экраны «Регистрации и слияния» и «Подписчики приложения» — вкладки
-- глобального админа `(global-admin)/doctor/analytics` — читали `public.platform_users` и
-- `public.user_channel_bindings` ОТНОШЕНИЕМ под `app_platform_settings`. У этой роли на
-- `platform_users` есть ровно `SELECT (id, calendar_timezone)` и на `user_channel_bindings` нет
-- ничего, поэтому оба маршрута отдавали 500 с 42501, и админ не видел ни одной цифры (живой обход
-- TEST 22.08.2026). Той же ошибкой падал и резолв тестовых учёток в id (`resolveAnalyticsExcludedUserIds`).
--
-- Грант не годится: решение владельца Р-АДМИН — «мне нахуй не нужны какие-то их данные, кроме того,
-- что нужно для моей работы». `platform_users` несёт ПДн, `user_channel_bindings` — внешние
-- идентификаторы человека в мессенджерах. Дверь отдаёт СЧЁТ: числа на экране появляются, а
-- табличный грант платформенной роли остаётся НУЛЁМ — читать нечем, а не «интерфейс не показывает».
--
-- ДВЕРЬ ОДНА НА ОБА ЭКРАНА, а не одна на счётчик и не одна на экран (AGENTS §5). Оба экрана
-- спрашивают одно и то же — «сколько людей за окно локальных суток `p_iana`, за вычетом служебных
-- учёток» — теми же четырьмя аргументами; регистрации, слияния и подписчики это ВАРИАНТЫ одного
-- действия, то есть секции одного ответа, а не три функции. Существующий корень
-- `app.read_platform_analytics_dashboard` переиспользовать нельзя: он считает девятнадцать
-- отношений ради другого экрана и ни одной из этих трёх величин не отдаёт (его `patients` —
-- другой фильтр: без учёта слияния внутри окна и без архивных).
--
-- РАЗБОР ПРАВ КОРНЯ (AGENTS §1 «Перед приземлением миграции»).
-- Тело исполняется владельцем шва `app_seam_platform_analytics_owner` — СУЩЕСТВУЮЩИМ, не новым:
-- ровно этот шов уже владеет `app.read_platform_analytics_dashboard` и уже читает все три
-- отношения этого тела. Второго владельца заводить незачем, а чужого — нельзя: расширить шов
-- ровно то, чего именованные корни и существуют, чтобы не делать.
--   1. `public.platform_users` — SELECT (id, role, created_at, merged_at, merged_into_id,
--      is_archived). У шва объявлены id/role/created_at/merged_into_at/is_archived; `merged_at`
--      добавляется объявлением в этой же ветке — по нему считается ряд слияний по дням.
--   2. `public.user_channel_bindings` — SELECT (user_id, channel_code, external_id, created_at,
--      bot_blocked_at). У шва объявлены user_id/channel_code/external_id; `created_at`
--      (день первой привязки) и `bot_blocked_at` (подписчик — тот, у кого бот не заблокирован)
--      добавляются объявлением здесь же.
--   3. `public.user_contacts` — SELECT канонических колонок; уже объявлен швом через
--      CANONICAL_CONTACT_SURFACE_CORRECTIONS, по нему отсекаются телефоны служебных учёток.
-- Ни одной записи тело не делает, `FOR UPDATE`/`FOR SHARE` не берёт, новых отношений не вводит.
-- EXECUTE получает ровно `app_platform_settings` и ровно через declaration.ts — миграция прав не
-- выдаёт и не отзывает (AGENTS §1).
--
-- ПОЛИТИКА «кто тестовый» ОСТАЁТСЯ ОДНА и живёт в TypeScript (`loadAnalyticsTestAccountSpec`):
-- сюда приезжает уже готовый СПИСОК идентификаторов тем же `p_audience_json`, что у соседнего
-- корня дашборда. Тело только применяет присланный список — второго определения «служебной
-- учётки» в SQL не появляется.

CREATE OR REPLACE FUNCTION app.read_platform_user_stats(
  p_start timestamp with time zone,
  p_end_exclusive timestamp with time zone,
  p_iana text,
  p_audience_json text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_stats jsonb;
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
    'analytics.platform-user-stats.read',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg
    ]),
    'app.read_platform_user_stats(timestamp with time zone,timestamp with time zone,text,text)'::regprocedure
  );

  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start THEN
    RAISE EXCEPTION 'platform_user_stats_range_invalid' USING ERRCODE = '22023';
  END IF;
  -- Часовой пояс отбивается ЗДЕСЬ, как у соседнего корня: неизвестное имя иначе всплыло бы как
  -- 22023 из середины запроса, где его никто не свяжет с параметром.
  IF p_iana IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana) THEN
    RAISE EXCEPTION 'platform_user_stats_timezone_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_audience := p_audience_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'platform_user_stats_audience_invalid' USING ERRCODE = '22023';
  END;
  IF v_audience IS NULL OR jsonb_typeof(v_audience) <> 'object' THEN
    RAISE EXCEPTION 'platform_user_stats_audience_invalid' USING ERRCODE = '22023';
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

  -- ── 1. Регистрации ──────────────────────────────────────────────────────────────────────────
  -- Регистрация, слитая ВНУТРИ того же окна, из ряда регистраций уходит: иначе один человек
  -- считается дважды — строкой-донором и строкой-приёмником.
  registration_rows AS (
    SELECT u.created_at AS created_at
      FROM public.platform_users AS u
     WHERE u.role = 'client'
       AND u.created_at >= p_start AND u.created_at < p_end_exclusive
       AND NOT (u.merged_at IS NOT NULL
                AND u.merged_at >= p_start AND u.merged_at < p_end_exclusive)
       AND u.id NOT IN (SELECT id FROM excluded_users)
  ),
  merge_rows AS (
    SELECT u.merged_at AS merged_at
      FROM public.platform_users AS u
     WHERE u.merged_into_id IS NOT NULL
       AND u.merged_at IS NOT NULL
       AND u.merged_at >= p_start AND u.merged_at < p_end_exclusive
       AND u.id NOT IN (SELECT id FROM excluded_users)
  ),
  registrations_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, created_at))::date::text AS d, count(*) AS n
        FROM registration_rows GROUP BY 1) AS g
  ),
  merges_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, merged_at))::date::text AS d, count(*) AS n
        FROM merge_rows GROUP BY 1) AS g
  ),

  -- ── 2. Подписчики приложения ────────────────────────────────────────────────────────────────
  -- Подписчик — живой клиент с непогашенной привязкой мессенджера; дата подписки — ПЕРВАЯ такая
  -- привязка, поэтому один человек попадает ровно в один день, сколько бы каналов ни привязал.
  subscriber_first_binding AS (
    SELECT u.id AS id, MIN(b.created_at) AS first_at
      FROM public.platform_users AS u
      JOIN public.user_channel_bindings AS b
        ON b.user_id = u.id
       AND b.channel_code IN ('telegram', 'max')
       AND b.bot_blocked_at IS NULL
     WHERE u.role = 'client'
       AND u.merged_into_id IS NULL
       AND COALESCE(u.is_archived, false) = false
       AND u.id NOT IN (SELECT id FROM excluded_users)
     GROUP BY u.id
  ),
  subscribers_new_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, first_at))::date::text AS d, count(*) AS n
        FROM subscriber_first_binding
       WHERE first_at >= p_start AND first_at < p_end_exclusive
       GROUP BY 1) AS g
  )

  SELECT jsonb_build_object(
    'registrations', jsonb_build_object(
      'total', (SELECT count(*) FROM registration_rows),
      'byDay', (SELECT m FROM registrations_by_day)
    ),
    'merges', jsonb_build_object(
      'total', (SELECT count(*) FROM merge_rows),
      'byDay', (SELECT m FROM merges_by_day)
    ),
    'subscribers', jsonb_build_object(
      'countBeforeStart',
        (SELECT count(*) FROM subscriber_first_binding WHERE first_at < p_start),
      'newByDay', (SELECT m FROM subscribers_new_by_day)
    )
  ) INTO v_stats;

  RETURN v_stats;
END
$function$
;
