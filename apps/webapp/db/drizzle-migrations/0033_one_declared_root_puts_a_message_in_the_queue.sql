-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0033
--
-- Часть 1. Тело `app.resolve_outgoing_delivery_scope(uuid)` возвращается в ledger миграций.
--
-- `deploy/postgres/c4-operational-runtime.sql:509` утверждает, что тело живёт «in
-- apps/webapp/db/drizzle-migrations/*», а `scripts/check-c4-migration-owned-function-bodies.mjs`
-- запрещает держать его в оверлее. В ledger его при этом НЕ БЫЛО: функция существовала только как
-- живой объект базы плюс сгенерированный снимок
-- `deploy/postgres/generated/prod-to-target/schema-pre.sql`, удалённый из ветки коммитом bfe6b48f0.
-- Функция стоит на критическом пути доставки: неузнанный `kind` она возвращает как `invalid`, и
-- воркер хоронит строку без отправки и без ретрая. Ровно этим 04.08 карантинился КАЖДЫЙ код входа
-- (`auth_email_otp`), см. комментарий в c4. Незаверсионированное тело на таком пути восстановить
-- при пересоздании базы неоткуда — поэтому оно здесь.
--
-- Тело ниже — дословно живое тело `bcb_webapp_dev` (`pg_proc.prosrc`), сверенное со снимком
-- schema-pre.sql: расходятся только dollar-кавычки обёртки, строки тела совпадают.
--
-- ЕДИНСТВЕННОЕ изменение против живого тела — `outbound_message` в списке глобальных видов.
-- Смысл: универсальный вид (часть 2) без организации — платформенное сообщение, а не мусор. Без
-- этой строки первое же платформенное сообщение повторило бы историю auth_email_otp. Арендаторского
-- сообщения это не касается: строка с непустым organization_id резолвится ПЕРВОЙ веткой, до любого
-- разбора вида, поэтому новое сообщение не требует правки этой функции вовсе.

CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)
RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_payload jsonb;
  stored_organization_id uuid;
  v_occurrence_id text;
  v_broadcast_audit_id uuid;
  v_incident_id uuid;
  occurrence_org uuid;
  rule_org uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure);

  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO queue_kind, stored_organization_id, queue_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.id = p_queue_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 'queue_not_found'::text;
    RETURN;
  END IF;

  IF stored_organization_id IS NOT NULL THEN
    RETURN QUERY SELECT queue_kind, stored_organization_id, 'tenant'::text;
    RETURN;
  END IF;

  IF queue_kind = 'operator_alert' THEN
    IF COALESCE(queue_payload ->> 'incidentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_incident_id'::text;
      RETURN;
    END IF;
    v_incident_id := (queue_payload ->> 'incidentId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.operator_incidents AS incident WHERE incident.id = v_incident_id) THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'incident_not_found'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind IN ('inbound_reply', 'operator_health_digest', 'auth_email_otp', 'outbound_message') THEN
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind = 'reminder_dispatch' THEN
    IF COALESCE(queue_payload ->> 'occurrenceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_occurrence_id'::text;
      RETURN;
    END IF;
    v_occurrence_id := queue_payload ->> 'occurrenceId';
    SELECT occurrence.organization_id, rule.organization_id INTO occurrence_org, rule_org
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.id = v_occurrence_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'occurrence_not_found'::text;
    ELSIF occurrence_org IS NOT NULL AND rule_org IS NOT NULL AND occurrence_org <> rule_org THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'ambiguous_organization'::text;
    ELSIF COALESCE(occurrence_org, rule_org) IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, COALESCE(occurrence_org, rule_org), 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  IF queue_kind = 'doctor_broadcast_intent' THEN
    IF COALESCE(queue_payload ->> 'broadcastAuditId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_broadcast_audit_id'::text;
      RETURN;
    END IF;
    v_broadcast_audit_id := (queue_payload ->> 'broadcastAuditId')::uuid;
    SELECT audit.organization_id INTO organization_id
    FROM public.broadcast_audit AS audit WHERE audit.id = v_broadcast_audit_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'broadcast_audit_not_found'::text;
    ELSIF organization_id IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, organization_id, 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT queue_kind, NULL::uuid, 'unsupported_queue_kind'::text;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Часть 2. ОДИН корень постановки исходящего сообщения в очередь.
--
-- Решение владельца 19.08: «письмо и уведомление не надо ждать — абсолютно точно… должно быть
-- универсальным по сути механизмом, в который просто передается нужный контекст от вебапп. Не 100
-- функций на каждое отправляемое событие. Тогда и роль и права и контекст подставлять надо в одном
-- месте.»
--
-- До этой функции у вебаппа не было НИ ОДНОГО пути положить произвольное исходящее сообщение в
-- `public.outgoing_delivery_queue`: шов `pgOutgoingDeliveryQueue.ts` пишет в таблицу напрямую и
-- работает только там, где у роли есть table grant, а `app.email_auth_enqueue_otp_delivery` умеет
-- ровно одно письмо — код входа. Поэтому письмо-подтверждение записи уходило синхронным HTTP к
-- интегратору и держало ответ пациенту 9.0 с на SMTP-хендшейке.
--
-- Виды сообщений НЕ становятся видами очереди. Вид очереди один — `outbound_message`; сообщения
-- различает `p_purpose`, который идёт в `event_id` и никем не разбирается по веткам. Новое
-- сообщение не трогает ни эту функцию, ни резолвер выше, ни воркер.
--
-- Класс политики внешнего выхода (`outboundMessageClass`/`outboundCapability`) вызывающий НЕ
-- задаёт. Функция выводит его сама, повторяя правило подписанного relay-маршрута
-- (`apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts:88-99`): явный
-- `senderScope='clinic_required'` — клиничная рассылка, всё остальное — обязательная доставка. Это
-- условие того, что корень НЕ шире сегодняшнего relay: вызывающий не может назначить себе маркер,
-- которого не получил бы через HTTP.
--
-- Гранты на таблицу не расширяются: владелец шва `app_seam_delivery_scope_owner` уже покрыт
-- политикой `rev10_named_root_owner_gate_136`, роли рантайма получают только EXECUTE.
CREATE OR REPLACE FUNCTION app.enqueue_outbound_message(
  p_organization_id uuid,
  p_purpose text,
  p_idempotency_key text,
  p_channel text,
  p_recipient text,
  p_content jsonb,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_recipient jsonb;
  v_dispatch_channel text;
  v_message_class text;
  v_capability text;
  v_event_id text;
  v_payload jsonb;
  v_row_count integer;
-- Рукописный ТОЧНЫЙ гейт ниже. Корень многокапабилитный (пациент И staff идут в ОДНУ дверь — это
-- и есть «в одном месте» из решения владельца), а `generate.mjs` в режиме `exact_existing` такой
-- гейт не переписывает: он его ПРОВЕРЯЕТ на присутствие каждого токена декларации. Форма — ровно
-- та же, что у `app.append_platform_audit_event` (миграция 0025). Комментарий стоит ВЫШЕ открытия
-- тела намеренно: проверка гейта требует, чтобы за открывающим ключевым словом немедленно следовал
-- `PERFORM app.require_*`, и не допускает между ними ничего, включая комментарий.
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
      ROW('jsonb@1', pg_catalog.jsonb_send(p_content))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_max_attempts))::app.port_typed_arg
    ]),
    'app.enqueue_outbound_message(uuid,text,text,text,text,jsonb,integer)'::regprocedure
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
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN
    RAISE EXCEPTION 'outbound_message_content_invalid' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(COALESCE(p_content ->> 'text', '')), '') IS NULL THEN
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

  IF p_content ->> 'senderScope' = 'clinic_required' THEN
    v_message_class := 'broadcast_event';
    v_capability := 'clinic_delivery';
  ELSE
    v_message_class := 'routine_product';
    v_capability := 'essential_delivery';
  END IF;

  v_event_id := btrim(p_purpose) || ':' || btrim(p_idempotency_key);

  -- Содержимое переносится ДОСЛОВНО: `p_content` кладётся в payload как есть, поверх него
  -- ставятся только вычисленные функцией поля. Приёмник, молча роняющий необъявленное поле, —
  -- ровно тот дефект, что раньше отрывал .ics-вложение от письма-подтверждения.
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
      'payload', (p_content - 'senderScope') || jsonb_build_object(
        'recipient', v_recipient,
        'message', jsonb_build_object('text', p_content ->> 'text'),
        'delivery', jsonb_build_object('channels', jsonb_build_array(v_dispatch_channel))
          || CASE WHEN p_content ->> 'senderScope' = 'clinic_required'
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
