-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- #1112, Л-8. Свёртка устройств теперь несёт и замороженный счёт неудачных попыток.
--
-- Почему НАИБОЛЬШЕЕ за окно, а не последнее. Счёт обнуляется каждым успешным входом — владелец:
-- «Счётчик обнуляется при успешном входе». Значит «последнее значение» у живого устройства почти
-- всегда ноль: человек зашёл ещё раз, и число само себя стёрло. Показывать ноль там, где неделю
-- назад было четыре тысячи попыток, — это скрыть происшествие ровно от того, кому оно адресовано.
-- Поэтому берём максимум за окно И ДАТУ, когда он случился: без даты «3412» не с чем соотнести.
--
-- Три числа держатся врозь намеренно:
--   · неверные пароли С ЭТОГО устройства — кто-то за вашим столом, у кого есть ваш браузер;
--   · неверные пароли С НЕИЗВЕСТНЫХ устройств плюс сколько было разных адресов — подбор извне;
--   · неверные коды второго фактора — а это значит, что ПАРОЛЬ УЖЕ ПОДОШЁЛ.
-- Сложить их в одно «число попыток» значило бы стереть ровно ту разницу, ради которой считаем.
DROP FUNCTION IF EXISTS app.list_own_login_devices();
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.list_own_login_devices()'::regprocedure) LIKE '%worst_failed_second_factor_at%'
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
  countries text[],
  worst_failed_passwords integer,
  worst_failed_passwords_at timestamptz,
  worst_failed_passwords_since timestamptz,
  worst_unknown_passwords integer,
  worst_unknown_sources integer,
  worst_unknown_passwords_at timestamptz,
  worst_unknown_passwords_since timestamptz,
  worst_failed_second_factor integer,
  worst_failed_second_factor_at timestamptz
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
           e.method, e.country,
           e.failed_passwords_before, e.failed_passwords_before_unknown,
           e.unknown_sources_before, e.failed_second_factor_before, e.failures_since
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
    pg_catalog.array_remove(pg_catalog.array_agg(DISTINCT r.country), NULL) AS countries,
    -- Тот же приём, что и выше: берём ПЕРВЫЙ элемент упорядоченного набора. Порядок здесь — по
    -- величине счёта, поэтому дата и период приезжают ИЗ ТОЙ ЖЕ строки, что и само число, а не из
    -- случайной другой. `NULLS LAST` оставляет старые входы (тогда не считали) в хвосте.
    (pg_catalog.array_agg(r.failed_passwords_before
       ORDER BY r.failed_passwords_before DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_failed_passwords,
    (pg_catalog.array_agg(r.occurred_at
       ORDER BY r.failed_passwords_before DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_failed_passwords_at,
    (pg_catalog.array_agg(r.failures_since
       ORDER BY r.failed_passwords_before DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_failed_passwords_since,
    (pg_catalog.array_agg(r.failed_passwords_before_unknown
       ORDER BY r.failed_passwords_before_unknown DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_unknown_passwords,
    (pg_catalog.array_agg(r.unknown_sources_before
       ORDER BY r.failed_passwords_before_unknown DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_unknown_sources,
    (pg_catalog.array_agg(r.occurred_at
       ORDER BY r.failed_passwords_before_unknown DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_unknown_passwords_at,
    (pg_catalog.array_agg(r.failures_since
       ORDER BY r.failed_passwords_before_unknown DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_unknown_passwords_since,
    (pg_catalog.array_agg(r.failed_second_factor_before
       ORDER BY r.failed_second_factor_before DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_failed_second_factor,
    (pg_catalog.array_agg(r.occurred_at
       ORDER BY r.failed_second_factor_before DESC NULLS LAST, r.occurred_at DESC))[1]
      AS worst_failed_second_factor_at
  FROM recent r
  GROUP BY COALESCE(r.device_id, 'ua:' || pg_catalog.md5(COALESCE(r.user_agent, '')))
  ORDER BY pg_catalog.max(r.occurred_at) DESC
  LIMIT 50;
END
$function$;
