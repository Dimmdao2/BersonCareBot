-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0036
--
-- Найдено 19.08 в соседней работе по напоминаниям: `app.enqueue_outbound_message(...)` (миграция
-- 0033) объявляет `p_content` как `jsonb`. Аргумент корня входит в подписанный транскрипт вызова
-- (`app.hash_port_typed_args`), а клиент обязан воспроизвести те же байты, которые видит
-- PostgreSQL. Для `jsonb` это невозможно: `jsonb_send` отдаёт КАНОНИЧЕСКОЕ представление (свой
-- порядок ключей, своя нормализация чисел), а не строку, которую собрал клиент. Поэтому
-- `portTypedArgsForFunctionIdentity` (`packages/db-principal/src/portContext.ts:177-192`) типа
-- `jsonb` не поддерживает вовсе и бросает раньше запроса:
--   app.enqueue_outbound_message(...) uses unsupported port argument type jsonb
-- Живой эффект: письмо-подтверждение записи (`bookingCreatedEffects.ts`) в очередь не ставилось ни
-- разу — вызов падал в webapp-процессе до похода в базу. Соседняя миграция 0035
-- (`app.replace_appointment_reminder_generation`) уже решала тот же класс задачи правильно:
-- аргумент объявлен `text`, разбор `::jsonb` — внутри тела корня. Эта миграция повторяет ту же
-- форму для `enqueue_outbound_message`, а не изобретает новую.
--
-- Смена типа аргумента — это смена сигнатуры функции: `CREATE OR REPLACE` её не переписывает, а
-- породил бы ВТОРОЙ overload рядом со старым. Старая сигнатура снимается явным DROP, чтобы у корня
-- остался ровно один объявленный вход.

DROP FUNCTION IF EXISTS app.enqueue_outbound_message(uuid, text, text, text, text, jsonb, integer);

CREATE OR REPLACE FUNCTION app.enqueue_outbound_message(
  p_organization_id uuid,
  p_purpose text,
  p_idempotency_key text,
  p_channel text,
  p_recipient text,
  p_content text,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_content jsonb;
  v_recipient jsonb;
  v_dispatch_channel text;
  v_message_class text;
  v_capability text;
  v_event_id text;
  v_payload jsonb;
  v_row_count integer;
-- Рукописный ТОЧНЫЙ гейт ниже, без изменений против миграции 0033 кроме типа шестого аргумента в
-- транскрипте (`text@1` вместо `jsonb@1`). Комментарий стоит ВЫШЕ открытия тела намеренно: проверка
-- гейта требует, чтобы за открывающим ключевым словом немедленно следовал `PERFORM app.require_*`.
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_staff', 'MEMBER')
        THEN 'app_staff'::name
      ELSE 'app_patient'::name
    END,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_staff', 'MEMBER')
        THEN 'staff'::app.port_context_class
      ELSE 'patient'::app.port_context_class
    END,
    'outbound.message.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_purpose))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_idempotency_key))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_channel))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_recipient))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_content))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_max_attempts))::app.port_typed_arg
    ]),
    'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)'::regprocedure
  );

  IF p_purpose IS NULL OR btrim(p_purpose) !~ '^[a-z][a-z0-9._-]{2,63}$' THEN
    RAISE EXCEPTION 'outbound_message_purpose_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'outbound_message_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_recipient IS NULL OR length(btrim(p_recipient)) NOT BETWEEN 1 AND 320 THEN
    RAISE EXCEPTION 'outbound_message_recipient_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_content := p_content::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'outbound_message_content_invalid' USING ERRCODE = '22023';
  END;
  IF v_content IS NULL OR jsonb_typeof(v_content) <> 'object' THEN
    RAISE EXCEPTION 'outbound_message_content_invalid' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(COALESCE(v_content ->> 'text', '')), '') IS NULL THEN
    RAISE EXCEPTION 'outbound_message_text_required' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 20 THEN
    RAISE EXCEPTION 'outbound_message_max_attempts_invalid' USING ERRCODE = '22023';
  END IF;

  -- Закрытая карта слотов получателя, выведенная из самих адаптеров интегратора. Неизвестный канал
  -- отбивается ЗДЕСЬ, при вставке: иначе строка легла бы в очередь и умерла молча через сутки.
  IF p_channel = 'email' THEN
    v_recipient := jsonb_build_object('email', btrim(p_recipient));
    v_dispatch_channel := 'email';
  ELSIF p_channel = 'telegram' THEN
    v_recipient := jsonb_build_object('chatId', btrim(p_recipient));
    v_dispatch_channel := 'telegram';
  ELSIF p_channel = 'max' THEN
    v_recipient := jsonb_build_object('userId', btrim(p_recipient));
    v_dispatch_channel := 'max';
  ELSIF p_channel = 'sms' THEN
    v_recipient := jsonb_build_object('phoneNormalized', btrim(p_recipient));
    v_dispatch_channel := 'smsc';
  ELSIF p_channel = 'web_push' THEN
    v_recipient := jsonb_build_object('pushUserId', btrim(p_recipient));
    v_dispatch_channel := 'web_push';
  ELSE
    RAISE EXCEPTION 'outbound_message_channel_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_content ->> 'senderScope' = 'clinic_required' THEN
    v_message_class := 'broadcast_event';
    v_capability := 'clinic_delivery';
  ELSE
    v_message_class := 'routine_product';
    v_capability := 'essential_delivery';
  END IF;

  v_event_id := btrim(p_purpose) || ':' || btrim(p_idempotency_key);

  -- Содержимое переносится ДОСЛОВНО: `v_content` кладётся в payload как есть, поверх него ставятся
  -- только вычисленные функцией поля. Приёмник, молча роняющий необъявленное поле, — ровно тот
  -- дефект, что раньше отрывал .ics-вложение от письма-подтверждения.
  v_payload := jsonb_build_object(
    'intent', jsonb_build_object(
      'type', 'message.send',
      'meta', jsonb_build_object(
        'eventId', v_event_id,
        'occurredAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z',
        'source', v_dispatch_channel,
        'correlationId', v_event_id,
        'outboundMessageClass', v_message_class,
        'outboundCapability', v_capability
      ),
      'payload', (v_content - 'senderScope') || jsonb_build_object(
        'recipient', v_recipient,
        'message', jsonb_build_object('text', v_content ->> 'text'),
        'delivery', jsonb_build_object('channels', jsonb_build_array(v_dispatch_channel))
          || CASE WHEN v_content ->> 'senderScope' = 'clinic_required'
                  THEN jsonb_build_object('senderScope', 'clinic_required')
                  ELSE '{}'::jsonb END
      ) - 'text'
    ),
    'purpose', btrim(p_purpose)
  );

  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    p_organization_id, v_event_id, 'outbound_message', p_channel, v_payload,
    'pending', 0, p_max_attempts, now(), 0
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  RETURN v_row_count = 1;
END
$function$;
