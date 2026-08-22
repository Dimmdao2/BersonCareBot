-- BCB-MIGRATION-OWNER: app_seam_reminder_specialist_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.replace_specialist_task_reminder_generation(uuid,text,text)') IS NOT NULL
--
-- Кнопка «Выполнить» у задачи врача отвечала 500. Завершение задачи снимает ещё не отправленные
-- напоминания этой задачи, и снимало их РЕЛЯЦИОННЫМ `UPDATE public.outgoing_delivery_queue` под
-- принципалом персонала. У `app_staff` на очереди НОЛЬ привилегий и по решению их не должно быть —
-- очередь это поверхность доставки, — поэтому путь падал `42501 permission denied for table
-- outgoing_delivery_queue`. Тем же реляционным путём шла и постановка напоминания при создании и
-- правке задачи: напоминания по задачам специалиста не ставились НИ РАЗУ.
--
-- Дверь — та же форма, что у близнеца `app.replace_appointment_reminder_generation`: одно
-- поколение напоминаний одной сущности заменяется целиком (снять не отправленное прошлое поколение
-- + записать названное новое), владелец шва пишет строку, рабочая роль получает только EXECUTE.
-- Варианты вызова — параметры этой одной точки: создание задачи даёт непустой `p_deliveries` без
-- прошлого поколения, правка — непустой и снятие лишнего, завершение и удаление — пустой массив.
-- Второго пути к строке очереди не остаётся: реляционный писатель убран в том же изменении.
--
-- Гейт — `require_attested_context_for_roles`, как у соседа по шву
-- `app.refresh_specialist_task_reminder_materialization`: корень зовётся ВНУТРИ уже открытой
-- реляционной транзакции задачи (запись задачи и снятие её напоминаний обязаны быть одним
-- фактом), а `runWebappNamedRoot` с точным гейтом по построению начинается ДО транзакции.
-- Генератор прав сам приводит гейт к объявленному виду на каждом reconcile.
--
-- Тело исполняется владельцем шва и обходит RLS, поэтому арендная стена повторена здесь ДОСЛОВНО:
-- организация берётся из ПРИНЯТОГО контекста порта (`app.current_org_id()`, подделать нельзя), и
-- строки очереди и задача обязаны принадлежать ей. Гранты и политики остаются исключительно за
-- deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.replace_specialist_task_reminder_generation(
  p_task_id uuid,
  p_deliveries text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid;
  v_task_org uuid;
  v_prefix text;
  v_deliveries jsonb;
  v_delivery jsonb;
  v_event_ids text[];
  v_event_id text;
  v_channel text;
  v_payload jsonb;
  v_max_attempts integer;
  v_next_retry_at timestamp with time zone;
  v_written text[] := ARRAY[]::text[];
  v_row_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_staff'::name]::name[]);

  v_org := app.current_org_id();

  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'specialist_task_reminder_generation_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'specialist_task_reminder_generation_reason_invalid' USING ERRCODE = '22023';
  END IF;

  v_deliveries := NULL;
  BEGIN
    v_deliveries := p_deliveries::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'specialist_task_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END;
  IF v_deliveries IS NULL OR jsonb_typeof(v_deliveries) <> 'array' THEN
    RAISE EXCEPTION 'specialist_task_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END IF;

  -- Арендная стена. Владелец шва видит таблицу целиком, поэтому организация проверяется явно:
  -- задача обязана принадлежать организации принятого контекста, иначе врач одной клиники смог бы
  -- снять или переписать напоминания чужой.
  SELECT task.organization_id INTO v_task_org
  FROM public.specialist_tasks AS task
  WHERE task.id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'specialist reminder generation target is unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL OR v_task_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'specialist reminder generation organization mismatch' USING ERRCODE = '42501';
  END IF;

  v_prefix := 'specialist-task:' || p_task_id::text || ':';

  SELECT COALESCE(array_agg(entry ->> 'eventId'), ARRAY[]::text[])
  INTO v_event_ids
  FROM jsonb_array_elements(v_deliveries) AS entry;

  -- Снимается ровно НЕ отправленное намерение прошлого поколения этой задачи. Отправленная или уже
  -- похороненная строка — неизменяемое свидетельство, её не трогает никто.
  UPDATE public.outgoing_delivery_queue AS queue
  SET status = 'dead', dead_at = now(), last_error = p_reason, updated_at = now()
  WHERE queue.kind = 'specialist_task_reminder'
    AND queue.organization_id = v_org
    AND queue.event_id LIKE v_prefix || '%'
    AND queue.status IN ('pending', 'failed_retryable', 'processing')
    AND NOT (queue.event_id = ANY (v_event_ids));

  FOR v_delivery IN SELECT entry FROM jsonb_array_elements(v_deliveries) AS entry LOOP
    v_event_id := btrim(COALESCE(v_delivery ->> 'eventId', ''));
    v_channel := v_delivery ->> 'channel';
    v_payload := v_delivery -> 'payloadJson';
    IF length(v_event_id) NOT BETWEEN 1 AND 240 OR v_event_id NOT LIKE v_prefix || '%' THEN
      RAISE EXCEPTION 'specialist_task_reminder_event_id_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_channel NOT IN ('telegram', 'max', 'vk', 'email', 'web_push') THEN
      RAISE EXCEPTION 'specialist_task_reminder_channel_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
      OR v_payload #>> '{successOutcome,taskId}' IS DISTINCT FROM p_task_id::text THEN
      RAISE EXCEPTION 'specialist_task_reminder_payload_invalid' USING ERRCODE = '22023';
    END IF;
    v_max_attempts := (v_delivery ->> 'maxAttempts')::integer;
    IF v_max_attempts IS NULL OR v_max_attempts < 1 OR v_max_attempts > 20 THEN
      RAISE EXCEPTION 'specialist_task_reminder_max_attempts_invalid' USING ERRCODE = '22023';
    END IF;
    v_next_retry_at := (v_delivery ->> 'nextRetryAt')::timestamp with time zone;
    IF v_next_retry_at IS NULL THEN
      RAISE EXCEPTION 'specialist_task_reminder_next_retry_at_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.outgoing_delivery_queue AS queue (
      organization_id, event_id, kind, channel, payload_json,
      status, attempt_count, max_attempts, next_retry_at, last_error, dead_at, priority
    ) VALUES (
      v_org, v_event_id, 'specialist_task_reminder', v_channel, v_payload,
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
    IF v_row_count > 0 THEN
      v_written := v_written || v_event_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('writtenEventIds', to_jsonb(v_written));
END
$function$;
