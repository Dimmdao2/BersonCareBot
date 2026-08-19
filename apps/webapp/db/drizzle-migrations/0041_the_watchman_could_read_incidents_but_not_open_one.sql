-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0041
--
-- Замер 19.08 на TEST, головa ab1bee3554. Пятиминутный критический тик отвечает 500:
--
--   POST /api/internal/operator-health-critical/tick  -->  500 {"ok":false,"error":"internal_error"}
--   2026-08-19 11:28:37.039 bcb_test_webapp_staff@bersoncarebot_test 42501
--   ERROR:  permission denied for table operator_incidents
--   STATEMENT:  insert into "operator_incidents" ("id", "dedup_key", "direction", "integration",
--               "error_class", "error_detail", "opened_at", "last_seen_at", "occurrence_count",
--               "resolved_at", "alert_sent_at", "acknowledged_at", "initial_alert_sent_at",
--               "one_hour_alert_sent_at", "alert_claim_phase", "alert_claim_token",
--               "alert_claimed_at") values (default, $1, ... ) on conflict ("dedup_key")
--               where resolved_at IS NULL do update set ...
--
-- Отказ повторяется КАЖДЫЕ пять минут (11:20:02, 11:25:02, 11:27:27, 11:28:37, 11:30:01).
--
-- Почему. Сторож видел инциденты и не мог открыть ни одного. У `app_worker` на
-- `public.operator_incidents` табличный SELECT и ПОКОЛОНОЧНЫЙ INSERT на семь колонок
-- (`dedup_key`, `direction`, `integration`, `error_class`, `error_detail`, `opened_at`,
-- `last_seen_at`). Drizzle же перечисляет в INSERT ВСЕ колонки таблицы, подставляя `default`
-- десяти остальным (`id`, `occurrence_count`, `resolved_at`, `alert_sent_at`, `acknowledged_at`,
-- `initial_alert_sent_at`, `one_hour_alert_sent_at`, три `alert_claim_*`), — и упирается в
-- колонки, которых рабочей роли не выдавали. UPDATE-путь каденции (claim/complete/release/
-- resolve) трогает только выданные колонки, поэтому раньше тик и отвечал 200: пока ни одного
-- критического кандидата не было, до INSERT он не доходил. Цена человеку: в ту минуту, когда
-- сторож ДЕЙСТВИТЕЛЬНО что-то заметил, он падал целиком — и не записывал ни строки, которую
-- человек мог бы увидеть на /app/admin/system-health.
--
-- Почему близнец, а не переиспользование существующего корня. `app.open_or_touch_operator_incident
-- (text,text,text,text,text)` уже есть — но это дверь ИНТЕГРАТОРСКОГО контура, и её набор
-- исполнителей закрыт утверждением в `deploy/postgres/integrator-server-runtime-config.sql`:
-- там дословно `NOT has_function_privilege('app_worker', 'app.open_or_touch_operator_incident
-- (text,text,text,text,text)', 'EXECUTE')` плюс проверка «неожиданных грантополучателей»
-- (ровно владелец + рантайм-роль интегратора + `app_operational_delivery_worker`). Выдать
-- `app_worker` EXECUTE значит переписать это утверждение — то есть ослабить проверку, чтобы
-- задача прошла. Второй вариант переиспользования — войти вебаппом под
-- `app_operational_delivery_worker` (как это сделано для интегратора): тогда пятиминутный
-- сторож ради одной строки инцидента забирает себе ВСЮ личность доставщика вместе с его
-- поверхностью очереди. И третье: контракт не тот — существующий корень принимает `error_class`
-- и `integration` свободным текстом и возвращает `(id, occurrence_count)`, а каденции нужен
-- `opened_at` (по нему считается T0 -> +1ч) и закрытый namespace.
--
-- Поэтому близнец от ТОГО ЖЕ владельца шва (`app_seam_telemetry_operator_owner` — он же стоит
-- в гейте существующего корня), `execute: ['app_worker']`, класс `service`. Дверь уже: `error_class`
-- прибит к `critical` внутри тела, `integration` закрыт списком двух каденций
-- (`OperatorIncidentCadenceIntegration`), `opened_at` приходит часами тика.
--
-- Рабочей роли НЕ добавлено ни одной привилегии — наоборот, поколоночный INSERT `app_worker` на
-- `operator_incidents` снят: прямого INSERT в коде больше нет, а два пути к одной записи не
-- оставляют. Шву добавляются `opened_at` (INSERT/SELECT/UPDATE) и `initial_alert_sent_at`,
-- `one_hour_alert_sent_at` (SELECT/UPDATE) — поверхность его собственного тела.

CREATE OR REPLACE FUNCTION app.open_or_touch_operator_critical_incident(
  p_dedup_key text,
  p_direction text,
  p_integration text,
  p_opened_at timestamp with time zone,
  p_error_detail text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_id uuid;
  v_opened_at timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.critical-incident.open-or-touch',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_dedup_key))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_direction))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_integration))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_opened_at))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_error_detail))::app.port_typed_arg
    ]),
    'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)'::regprocedure
  );

  IF p_dedup_key IS NULL OR length(btrim(p_dedup_key)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'operator_critical_incident_dedup_key_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_direction IS NULL OR length(btrim(p_direction)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'operator_critical_incident_direction_invalid' USING ERRCODE = '22023';
  END IF;
  -- Закрытый список каденций закрыт ЗДЕСЬ, а не у вызывающего: `integration` — это namespace,
  -- по отсутствию в котором соседняя уборка закрывает чужие строки. Свободное значение тут
  -- означало бы, что одна каденция может погасить инциденты другой.
  IF p_integration IS NULL
     OR p_integration NOT IN ('critical_alert_cadence', 'saas_billing_reconcile_cadence') THEN
    RAISE EXCEPTION 'operator_critical_incident_cadence_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_opened_at IS NULL THEN
    RAISE EXCEPTION 'operator_critical_incident_opened_at_invalid' USING ERRCODE = '22023';
  END IF;

  -- `error_class` прибит: эта дверь открывает ТОЛЬКО критические инциденты каденции. Провайдерские
  -- классы отказов приходят другим контуром и через свою дверь. Подробность отказа режется на 900
  -- символах — ровно так же, как её режет соседний контур той же таблицы
  -- (`operatorHealthDrizzle.truncateDetail`): человек читает первую строку, а не дамп.
  INSERT INTO public.operator_incidents AS incident (
    dedup_key, direction, integration, error_class, error_detail, opened_at, last_seen_at
  )
  VALUES (
    p_dedup_key, p_direction, p_integration, 'critical',
    left(p_error_detail, 900), p_opened_at, p_opened_at
  )
  ON CONFLICT (dedup_key) WHERE resolved_at IS NULL
  DO UPDATE SET
    last_seen_at = p_opened_at,
    occurrence_count = incident.occurrence_count + 1,
    error_detail = coalesce(excluded.error_detail, incident.error_detail)
  RETURNING incident.id, incident.opened_at INTO v_id, v_opened_at;

  RETURN jsonb_build_object('id', v_id, 'openedAt', v_opened_at);
END
$function$;
