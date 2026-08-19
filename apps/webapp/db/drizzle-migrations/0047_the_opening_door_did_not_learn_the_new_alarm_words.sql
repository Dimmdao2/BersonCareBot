-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0047
--
-- Замер 19.08 на dev, независимым аудитором, исполнением, не чтением. Слияние d5cc09182 научило
-- пробу называть отказ провайдера настоящим классом (`provider_auth_rejected` и три соседа) и
-- открывать инцидент через ту же дверь, что настоящая отправка (`openOrTouchOperatorIncident` →
-- `app.open_or_touch_operator_probe_incident`, `viaProbeCapability` ветка). Миграция 0046 научила
-- закрывающую сторону этой же двери (`app.resolve_operator_probe_incidents`) новым классам, а
-- открывающую — нет. Дверь так и держала старый закрытый список из трёх пар:
--
--   ('max', 'max_probe_failed'), ('telegram', 'telegram_probe_failed'),
--   ('google_calendar', 'google_calendar_probe_failed')
--
-- и на всё остальное бросала `RAISE EXCEPTION ... USING ERRCODE = '23514'`.
--
-- Цена человеку, обе доказаны на dev исполнением реального пути: (1) отказ учётных данных
-- (`provider_auth_rejected`) — тот самый класс «пейджить с первого раза», ради которого владелец
-- 21.07 велел не ждать порога промахов, — упирался ИМЕННО в этот CHECK и не будил никого вообще,
-- даже по старому трёхпромашному порогу; (2) исключение никто не ловил вокруг вызова в
-- `runOperatorHealthProbes`, поэтому один отказ в этом месте рвал `for (const [name, ...] of
-- failures)` и терял отчёт об ОСТАЛЬНЫХ каналах того же тика — второе последствие того же дефекта.
--
-- Правится симметрично тому, как 0046 расширила соседнюю функцию: дверь принимает второе,
-- закрытое пространство `(integration ∈ {max, telegram, google_calendar}, error_class ∈
-- PAGE_ON_FIRST_OCCURRENCE_ERROR_CLASSES)` из `packages/operator-db-schema/src/
-- outboundProviderErrorClass.ts` — источник констант один; plpgsql не умеет импортировать TS-модуль,
-- поэтому значения здесь литералы, тем же способом, каким их уже держит `resolve_operator_probe_incidents`.
-- Направление (`outbound` / `outbound_delivery_provider`) и dedup-key больше не жёстко прибиты к
-- `'outbound:'`: они выбираются по тому, в какое из двух пространств попала пара, — иначе новый
-- класс закрывался бы под старым префиксом и `resolveOpenOperatorOutboundProbeIncidents` (который
-- гасит `outbound_delivery_provider:<integration>:` отдельно от `outbound:<integration>:`) никогда
-- бы не находил открытую этой веткой строку. Прежняя строгость для всего остального не снята: вне
-- этих двух пространств функция по-прежнему бросает `23514`.
--
-- Прав никому не добавляется: владелец, сигнатура и единственный EXECUTE (`app_operational_scheduler`)
-- те же, что в `deploy/postgres/c4-operational-runtime.sql`.

CREATE OR REPLACE FUNCTION app.open_or_touch_operator_probe_incident(
  p_integration text,
  p_error_class text,
  p_error_detail text
)
RETURNS TABLE (id uuid, occurrence_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_direction text;
BEGIN
  IF p_integration IS NULL
    OR p_error_class IS NULL
    OR length(COALESCE(p_error_detail, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator probe incident input'
      USING ERRCODE = '23514';
  END IF;

  IF (p_integration, p_error_class) IN (
       ('max', 'max_probe_failed'),
       ('telegram', 'telegram_probe_failed'),
       ('google_calendar', 'google_calendar_probe_failed')
     )
  THEN
    v_direction := 'outbound';
  ELSIF p_integration IN ('max', 'telegram', 'google_calendar')
    AND p_error_class IN (
      'provider_quota_exhausted', 'provider_credit_exhausted',
      'provider_auth_rejected', 'provider_not_configured'
    )
  THEN
    v_direction := 'outbound_delivery_provider';
  ELSE
    RAISE EXCEPTION 'invalid operator probe incident input'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT incident.id, incident.occurrence_count
  FROM app.open_or_touch_operator_incident(
    v_direction || ':' || p_integration || ':' || p_error_class,
    v_direction,
    p_integration,
    p_error_class,
    NULLIF(p_error_detail, '')
  ) AS incident;
END
$function$;
