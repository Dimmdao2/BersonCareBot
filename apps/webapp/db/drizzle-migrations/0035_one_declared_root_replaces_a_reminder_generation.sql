-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0034
--
-- ОДИН объявленный корень замены поколения напоминаний о записи.
--
-- Что чинится. `pgAppointmentReminderMaterialization.replaceGeneration` писал в
-- `public.outgoing_delivery_queue` ПРЯМЫМ drizzle-инсертом. INSERT на эту таблицу не выдан ни одной
-- рабочей роли (`app_tenant_service` в том числе — это держит
-- `deploy/postgres/privileges/reminder-materialization-declaration.test.mjs`), поэтому строк вида
-- `appointment_reminder` в очереди не появлялось никогда. Замерено 19.08 на `bcb_webapp_dev`:
--   select count(*) from outgoing_delivery_queue where kind = 'appointment_reminder';  -- 0
--
-- Форма — как у соседнего `app.enqueue_outbound_message` (миграция 0033): вызывающий передаёт
-- КОНТЕКСТ, строку пишет владелец шва. Новых грантов рабочим ролям нет ни одного: `app_tenant_service`
-- получает только EXECUTE, а INSERT/UPDATE/SELECT на очереди у
-- `app_seam_reminder_materialization_owner` уже есть — он владеет
-- `app.commit_patient_reminder_materialization` с той же поверхностью.
--
-- Почему `p_deliveries` имеет тип `text`, а не `jsonb`. Аргумент корня входит в подписанный
-- транскрипт вызова (`app.hash_port_typed_args`), а клиент обязан воспроизвести те же байты. Для
-- `jsonb` это невозможно: `jsonb_send` отдаёт КАНОНИЧЕСКОЕ представление PostgreSQL (свой порядок
-- ключей и своя нормализация чисел), а не строку, которую отправил клиент. Поэтому
-- `portTypedArgsForFunctionIdentity` (`packages/db-principal/src/portContext.ts:177-192`) типа
-- `jsonb` не поддерживает вовсе. Текст же хешируется побайтно и разбирается внутри корня.
--
-- Продуктовую форму строки (тексты, лестница мессенджеров, сроки) корень НЕ сочиняет: она приходит
-- готовой из `prepareAppointmentReminderDeliveries` и ложится в `payload_json` дословно. Корень
-- отвечает ровно за то, за что отвечает шов: вид строки, арендатор, актуальность записи и то, что
-- заменяется только НЕ отправленное намерение.

CREATE OR REPLACE FUNCTION app.replace_appointment_reminder_generation(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_generation_start_at timestamp with time zone,
  p_deliveries text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_deliveries jsonb;
  v_delivery jsonb;
  v_event_ids text[];
  v_event_id text;
  v_channel text;
  v_payload jsonb;
  v_max_attempts integer;
  v_next_retry_at timestamp with time zone;
  v_current boolean;
  v_inserted integer := 0;
  v_row_count integer;
-- Рукописный ТОЧНЫЙ гейт ниже, по образцу `app.read_patient_reminder_materialization_snapshot`
-- (миграция 0019). Комментарий стоит ВЫШЕ открытия тела намеренно: проверка гейта требует, чтобы за
-- открывающим ключевым словом немедленно следовал вызов `app.require_*`.
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_materialization_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'reminder.appointment-generation.replace',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_appointment_id))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_generation_start_at))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_deliveries))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_reason))::app.port_typed_arg
    ]),
    'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)'::regprocedure
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'appointment reminder generation organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_appointment_id IS NULL OR p_generation_start_at IS NULL THEN
    RAISE EXCEPTION 'appointment_reminder_generation_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'appointment_reminder_generation_reason_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_deliveries := p_deliveries::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'appointment_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END;
  IF v_deliveries IS NULL OR jsonb_typeof(v_deliveries) <> 'array' THEN
    RAISE EXCEPTION 'appointment_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(entry ->> 'eventId'), ARRAY[]::text[])
  INTO v_event_ids
  FROM jsonb_array_elements(v_deliveries) AS entry;

  -- Снимается ровно НЕ отправленное намерение прошлого поколения. Отправленная или уже похороненная
  -- строка — неизменяемое свидетельство, её не трогает никто. Арендатор в условии обязателен:
  -- владелец шва видит таблицу целиком.
  UPDATE public.outgoing_delivery_queue AS queue
  SET status = 'dead', dead_at = now(), last_error = p_reason, updated_at = now()
  WHERE queue.kind = 'appointment_reminder'
    AND queue.organization_id = p_organization_id
    AND queue.payload_json ->> 'appointmentId' = p_appointment_id::text
    AND queue.status IN ('pending', 'failed_retryable', 'processing')
    AND NOT (queue.event_id = ANY (v_event_ids));

  -- Напоминания ставятся только живой записи в то же время. Переехавшая или отменённая запись
  -- получает снятие поколения выше и ни одной новой строки.
  SELECT EXISTS (
    SELECT 1 FROM public.be_appointments AS appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = p_organization_id
      AND appointment.start_at = p_generation_start_at
      AND appointment.status IN ('created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
        'visit_confirmed', 'charged_to_package')
      AND appointment.deleted_at IS NULL
  ) INTO v_current;

  IF NOT v_current THEN
    RETURN jsonb_build_object('current', false, 'inserted', 0);
  END IF;

  FOR v_delivery IN SELECT entry FROM jsonb_array_elements(v_deliveries) AS entry LOOP
    v_event_id := btrim(COALESCE(v_delivery ->> 'eventId', ''));
    v_channel := v_delivery ->> 'channel';
    v_payload := v_delivery -> 'payloadJson';
    IF length(v_event_id) NOT BETWEEN 1 AND 240 THEN
      RAISE EXCEPTION 'appointment_reminder_event_id_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_channel NOT IN ('telegram', 'max', 'web_push') THEN
      RAISE EXCEPTION 'appointment_reminder_channel_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
      OR v_payload ->> 'appointmentId' IS DISTINCT FROM p_appointment_id::text THEN
      RAISE EXCEPTION 'appointment_reminder_payload_invalid' USING ERRCODE = '22023';
    END IF;
    v_max_attempts := (v_delivery ->> 'maxAttempts')::integer;
    IF v_max_attempts IS NULL OR v_max_attempts < 1 OR v_max_attempts > 20 THEN
      RAISE EXCEPTION 'appointment_reminder_max_attempts_invalid' USING ERRCODE = '22023';
    END IF;
    v_next_retry_at := (v_delivery ->> 'nextRetryAt')::timestamp with time zone;
    IF v_next_retry_at IS NULL THEN
      RAISE EXCEPTION 'appointment_reminder_next_retry_at_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.outgoing_delivery_queue AS queue (
      organization_id, event_id, kind, channel, payload_json,
      status, attempt_count, max_attempts, next_retry_at, last_error, dead_at, priority
    ) VALUES (
      p_organization_id, v_event_id, 'appointment_reminder', v_channel, v_payload,
      'pending', 0, v_max_attempts, v_next_retry_at, NULL, NULL, 0
    )
    ON CONFLICT (event_id) DO UPDATE
      SET organization_id = excluded.organization_id,
          kind = excluded.kind,
          channel = excluded.channel,
          payload_json = excluded.payload_json,
          status = excluded.status,
          attempt_count = excluded.attempt_count,
          max_attempts = excluded.max_attempts,
          next_retry_at = excluded.next_retry_at,
          last_error = NULL,
          dead_at = NULL,
          updated_at = now()
      WHERE queue.status IN ('pending', 'failed_retryable');
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  RETURN jsonb_build_object('current', true, 'inserted', v_inserted);
END
$function$;
