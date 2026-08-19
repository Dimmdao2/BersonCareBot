-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0039
--
-- Замер 19.08 на TEST, роль `bcb_test_webapp_staff`, один залп из двенадцати запросов:
--   42501 permission denied for table outgoing_delivery_queue
--   STATEMENT: select count(*) from "outgoing_delivery_queue" where status in ($1,$2) and next_retry_at <= now()
--   STATEMENT: select "channel", count(*) from "outgoing_delivery_queue" ... group by "channel"
--   STATEMENT: select "kind", count(*) from "outgoing_delivery_queue" ... group by "kind"
--   STATEMENT: select max("sent_at") from "outgoing_delivery_queue"
--   ... и ещё восемь того же залпа
--
-- Это `pgOperatorHealthRead.getOutgoingDeliveryQueueHealth`. У `app_staff` и `app_worker` на этой
-- таблице нет НИ ОДНОЙ привилегии и по решению не должно быть; проверено исполнением на
-- `bcb_webapp_dev`:
--   BEGIN; SET LOCAL ROLE app_staff;  SELECT count(*) FROM public.outgoing_delivery_queue; -- 42501
--   BEGIN; SET LOCAL ROLE app_worker; SELECT count(*) FROM public.outgoing_delivery_queue; -- 42501
--
-- Чего это стоит человеку. Вызов стоит в ГОЛОМ `Promise.all` внутри
-- `collectCriticalHealthSignalsBase`, поэтому падает не панель, а ВЕСЬ пятиминутный критический тик
-- (`runOperatorHealthCriticalTick`) и баннер здоровья в кабинете врача: оператор не получает НИ
-- ОДНОГО критического алерта — ни про мёртвую очередь, ни про backlog, ни про потерянный пульс
-- доставки. В суточной сводке тот же вызов заглушён `.catch(() => null)`
-- (`collectOperatorHealthDigestInput.ts:55`), поэтому там строки очереди просто молчат.
--
-- Дверь — та же, что у соседей по операторскому здоровью (миграция 0038,
-- `app.read_operator_health_digest_last_sent_at()`): шов операторской телеметрии, рабочая роль
-- `app_worker`, только EXECUTE. Двенадцать запросов сведены в ОДИН снимок: у корня одна дверь, а не
-- двенадцать. Шву к поколоночным грантам добавляются ровно две недостающие колонки —
-- `next_retry_at` и `updated_at`; рабочим ролям не добавляется ничего.

CREATE OR REPLACE FUNCTION app.read_operator_delivery_queue_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  snapshot jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.delivery-queue.aggregate',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_operator_delivery_queue_health()'::regprocedure
  );

  -- Один проход по отношению вместо двенадцати. `dead` для оператора — это отказ МЕХАНИЗМА,
  -- поэтому заблокировавший бота получатель (`recipient_blocked_bot`) считается отдельно и в
  -- деградацию не входит: иначе один человек, нажавший «блок», навсегда красит здоровье системы.
  WITH queue_rows AS (
    SELECT queue.channel AS channel,
           queue.kind AS kind,
           queue.created_at AS created_at,
           queue.sent_at AS sent_at,
           queue.updated_at AS updated_at,
           (queue.status IN ('pending', 'failed_retryable') AND queue.next_retry_at <= now()) AS is_due,
           (queue.status = 'dead'
             AND (queue.failure_class IS NULL OR queue.failure_class <> 'recipient_blocked_bot')) AS is_operator_dead,
           (queue.status = 'dead' AND queue.failure_class = 'recipient_blocked_bot') AS is_blocked_dead,
           (queue.status = 'processing') AS is_processing,
           (queue.status = 'sent' AND queue.sent_at >= now() - interval '24 hours') AS is_confirmed_24h
    FROM public.outgoing_delivery_queue AS queue
  ),
  totals AS (
    SELECT count(*) FILTER (WHERE is_due) AS due_backlog,
           count(*) FILTER (WHERE is_operator_dead) AS dead_total,
           count(*) FILTER (WHERE is_blocked_dead) AS blocked_recipient_total,
           count(*) FILTER (WHERE is_processing) AS processing_count,
           count(*) FILTER (WHERE is_confirmed_24h) AS confirmed_sent_last_24h,
           min(created_at) FILTER (WHERE is_due) AS oldest_due_created_at,
           max(sent_at) AS last_sent_at,
           max(updated_at) AS last_queue_activity_at
    FROM queue_rows
  ),
  due_by_channel AS (
    SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::jsonb) AS m
    FROM (SELECT channel, count(*) AS n FROM queue_rows WHERE is_due GROUP BY channel) AS g
  ),
  due_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
    FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_due GROUP BY kind) AS g
  ),
  dead_by_kind AS (
    SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) AS m
    FROM (SELECT kind, count(*) AS n FROM queue_rows WHERE is_operator_dead GROUP BY kind) AS g
  )
  SELECT jsonb_build_object(
    'dueBacklog', totals.due_backlog,
    'deadTotal', totals.dead_total,
    'blockedRecipientTotal', totals.blocked_recipient_total,
    'processingCount', totals.processing_count,
    'confirmedSentLast24h', totals.confirmed_sent_last_24h,
    'oldestDueCreatedAt', totals.oldest_due_created_at,
    'lastSentAt', totals.last_sent_at,
    'lastQueueActivityAt', totals.last_queue_activity_at,
    'dueByChannel', due_by_channel.m,
    'dueByKind', due_by_kind.m,
    'deadByKind', dead_by_kind.m
  ) INTO snapshot
  FROM totals, due_by_channel, due_by_kind, dead_by_kind;

  RETURN snapshot;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Второй разрыв на том же пути, и он дороже первого: суточная сводка здоровья не уходила НИ РАЗУ.
--   select count(*) from public.outgoing_delivery_queue where kind='operator_health_digest'  -->  0
-- Миграция 0038 вылечила ЧТЕНИЕ времени прошлой отправки; ПОСТАНОВКА осталась прямым INSERT из
-- `pgOutgoingDeliveryQueue.enqueueReady` под `app_staff`, у которого на очереди нет ни одной
-- привилегии. Проверено исполнением на `bcb_webapp_dev`:
--   BEGIN; SET LOCAL ROLE app_staff;
--     INSERT INTO public.outgoing_delivery_queue (event_id,kind,channel,status)
--       VALUES ('x','operator_health_digest','email','pending');   -- 42501
-- То есть тик сводки, даже дойдя до конца, всё равно вернул бы «вставлено 0».
--
-- Дверь — шов доставки `app_seam_delivery_scope_owner`, тот же, что уже держит
-- `app.enqueue_outbound_message`. Универсальный корень исходящего для сводки НЕ подходит: он
-- жёстко ставит `kind='outbound_message'` и сам собирает payload, а операторская сводка — свой вид
-- строки (`operator_health_digest`) со своим классом (`operator_security`/`operator_alert`), по
-- которому её отбирает `outgoingDeliveryScope.ts` у интегратора. Поэтому у неё собственный корень,
-- а не подмена вида. Рабочая роль получает EXECUTE и ничего больше: все десять колонок вставки у
-- шва УЖЕ есть, новых поколоночных грантов миграция не добавляет.
--
-- `ON CONFLICT DO NOTHING` — это идемпотентность суток: повторный `event_id`
-- (`operator-health-digest:<дата>:<канал>:<хеш получателя>`) означает «сводка за эти сутки этому
-- адресату уже поставлена», а не «обнови её».

CREATE OR REPLACE FUNCTION app.enqueue_operator_health_digest_delivery(
  p_event_id text,
  p_channel text,
  p_payload_json text,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_payload jsonb;
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.digest.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_event_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_channel))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_payload_json))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_max_attempts))::app.port_typed_arg
    ]),
    'app.enqueue_operator_health_digest_delivery(text,text,text,integer)'::regprocedure
  );

  IF p_event_id IS NULL OR length(btrim(p_event_id)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'operator_health_digest_event_id_invalid' USING ERRCODE = '22023';
  END IF;
  -- Закрытый список каналов — тот же, что у соседнего корня исходящего. Неизвестный канал
  -- отбивается ЗДЕСЬ: иначе строка легла бы в очередь и молча умерла через шесть попыток.
  IF p_channel IS NULL OR p_channel NOT IN ('telegram', 'max', 'sms', 'email', 'web_push') THEN
    RAISE EXCEPTION 'operator_health_digest_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 20 THEN
    RAISE EXCEPTION 'operator_health_digest_max_attempts_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_payload := p_payload_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'operator_health_digest_payload_invalid' USING ERRCODE = '22023';
  END;
  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
    OR v_payload -> 'intent' ->> 'type' <> 'message.send'
    OR nullif(btrim(COALESCE(v_payload #>> '{intent,meta,eventId}', '')), '') IS NULL THEN
    RAISE EXCEPTION 'operator_health_digest_payload_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NULL, btrim(p_event_id), 'operator_health_digest', p_channel, v_payload,
    'pending', 0, p_max_attempts, now(), 0
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  RETURN v_row_count = 1;
END
$function$;
