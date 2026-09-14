-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.resolve_operator_probe_incidents(text)'::regprocedure) LIKE '%email_staff_round_trip_failed%' AND pg_catalog.pg_get_functiondef('app.open_or_touch_operator_probe_incident(text,text,text)'::regprocedure) LIKE '%email_patient_round_trip_failed%'
-- Почтовая проба круговой доставки существует в приложении с обеих сторон — она открывает инцидент
-- на отказ и закрывает его на выздоровлении, — но ни одна из двух дверей БД про неё не знала.
-- Замерено на проде 14.09.2026: 92 раза в сутки `invalid operator probe incident prefix` (23514) на
-- каждом тике расписания, в логе `email.patientResolve: failed` и `email.staffResolve: failed`.
--
-- Почему именно так, а не «применить забытый оверлей»: поддержка почты описана ТОЛЬКО в
-- `deploy/postgres/c4-operational-runtime.sql`, а его редакция обеих функций СТАРШЕ живой — в ней нет
-- ни строки-стража `require_attested_context_for_roles`, ни ветки классов «пейджить с первого раза»
-- (решение владельца 21.07). Наложить файл целиком значило бы снять стража и откатить разбор причин.
-- Поэтому здесь ЖИВОЕ тело плюс ровно почта.
CREATE OR REPLACE FUNCTION app.open_or_touch_operator_probe_incident(
  p_integration text,
  p_error_class text,
  p_error_detail text
) RETURNS TABLE(id uuid, occurrence_count integer)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  v_direction text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
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
  ELSIF (p_integration, p_error_class) IN (
       ('email', 'email_patient_round_trip_failed'),
       ('email', 'email_staff_round_trip_failed')
     )
  THEN
    -- Почтовая проба пейджится с ПЕРВОГО промаха: порога подряд идущих отказов у неё нет, поэтому
    -- её инцидент живёт в том же пространстве, что и отказ настоящей отправки.
    v_direction := 'outbound_delivery_provider';
  ELSIF p_integration IN ('max', 'telegram', 'google_calendar', 'email')
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Обратная сторона той же пробы: выздоровела — закрыть то, что открыла. Префикс почты называет КЛАСС
-- целиком, а не канал с двоеточием на конце, потому что у почты две независимые аудитории (пациент и
-- специалист) в одном канале: успех письма пациенту ничего не говорит про письмо специалисту.
CREATE OR REPLACE FUNCTION app.resolve_operator_probe_incidents(p_dedup_key_prefix text)
RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  v_resolved integer;
  v_page_on_first_only boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
  IF p_dedup_key_prefix IS NULL
    OR p_dedup_key_prefix NOT IN (
      'outbound:max:', 'outbound:telegram:', 'outbound:google_calendar:',
      'outbound_delivery_provider:max:',
      'outbound_delivery_provider:telegram:',
      'outbound_delivery_provider:google_calendar:',
      'outbound_delivery_provider:email:email_patient_round_trip_failed',
      'outbound_delivery_provider:email:email_staff_round_trip_failed'
    )
  THEN
    RAISE EXCEPTION 'invalid operator probe incident prefix'
      USING ERRCODE = '23514';
  END IF;

  v_page_on_first_only := p_dedup_key_prefix LIKE 'outbound_delivery_provider:%';

  WITH resolved AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now()
    WHERE incident.resolved_at IS NULL
      AND incident.dedup_key LIKE p_dedup_key_prefix || '%'
      AND (
        NOT v_page_on_first_only
        OR incident.error_class IN (
          'provider_quota_exhausted', 'provider_credit_exhausted',
          'provider_auth_rejected', 'provider_not_configured',
          'email_patient_round_trip_failed', 'email_staff_round_trip_failed'
        )
      )
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$function$;
