-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.list_own_login_devices()') IS NOT NULL
-- #1112, Л-6д. Раскатка списка устройств со своего экрана админа платформы на «Учётку» специалиста
-- (решение владельца 14.09, дословно: «раскатывай в Учетку -> Безопасность»).
--
-- Почему дверь, а не грант на таблицу. До этой миграции `public.user_login_events` читался напрямую,
-- и SELECT был выдан ровно одной платформенной роли — поэтому у специалиста экран честно показывал
-- отказ. Напрашивающийся ответ «выдать SELECT ещё и роли персонала» неверен: у таблицы нет построчной
-- защиты, стена стоит в приложении. Табличный грант персоналу означал бы, что ЛЮБОЙ будущий запрос,
-- забывший условие «только свои», отдаёт журнал входов чужих людей — вместе с их адресами. См.
-- раздел «Права — через дверь, а не грантом на таблицу» в docs/_TODO/LOGIN_HISTORY_2026-09-13.md.
--
-- Дверь НЕ ПРИНИМАЕТ идентификатор человека. Чьи устройства вернутся — определяет принятый контекст
-- сессии (`app.current_actor_user_id()`), а не аргумент вызова. Поэтому «показать чужие устройства»
-- здесь не ошибка вызывающего, которую можно допустить, а действие, которого не существует.
--
-- Окно и длина списка тоже переехали внутрь: это свойства журнала, а не выбор экрана. Свёртка идёт по
-- последним 2000 успешным входам — сначала отбор по индексу, потом группировка, иначе на длинной
-- истории группировался бы весь журнал целиком.
CREATE OR REPLACE FUNCTION app.list_own_login_devices()
RETURNS TABLE(
  group_key text,
  device_id text,
  last_seen_at timestamptz,
  login_count bigint,
  device_kind text,
  os text,
  browser text,
  method text,
  countries text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_staff', 'MEMBER') THEN 'app_staff'::name
      ELSE 'app_platform_settings'::name
    END,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_staff', 'MEMBER')
        THEN 'staff'::app.port_context_class
      ELSE 'platform'::app.port_context_class
    END,
    'auth.user-login-devices.list-own',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_own_login_devices()'::regprocedure
  );

  -- Сам поднимет 42501, если принятого акторского контекста нет: список без имени спрашивающего
  -- вернуть нечем, и молча отдавать пустоту здесь нельзя — пустой список читается как «входов не
  -- было», а это другое утверждение.
  v_user_id := app.current_actor_user_id();

  RETURN QUERY
  WITH recent AS (
    SELECT e.device_id, e.user_agent, e.occurred_at, e.device_kind, e.os, e.browser,
           e.method, e.country
      FROM public.user_login_events e
     WHERE e.user_id = v_user_id AND e.outcome = 'success'
     ORDER BY e.occurred_at DESC
     LIMIT 2000
  )
  SELECT
    COALESCE(r.device_id, 'ua:' || pg_catalog.md5(COALESCE(r.user_agent, ''))) AS group_key,
    pg_catalog.max(r.device_id) AS device_id,
    pg_catalog.max(r.occurred_at) AS last_seen_at,
    pg_catalog.count(*) AS login_count,
    (pg_catalog.array_agg(r.device_kind ORDER BY r.occurred_at DESC))[1] AS device_kind,
    (pg_catalog.array_agg(r.os ORDER BY r.occurred_at DESC))[1] AS os,
    (pg_catalog.array_agg(r.browser ORDER BY r.occurred_at DESC))[1] AS browser,
    (pg_catalog.array_agg(r.method ORDER BY r.occurred_at DESC))[1] AS method,
    pg_catalog.array_remove(pg_catalog.array_agg(DISTINCT r.country), NULL) AS countries
  FROM recent r
  GROUP BY COALESCE(r.device_id, 'ua:' || pg_catalog.md5(COALESCE(r.user_agent, '')))
  ORDER BY pg_catalog.max(r.occurred_at) DESC
  LIMIT 50;
END
$function$;
