-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0044
--
-- Красный баннер горел на мусоре и не мог погаснуть НИКОГДА.
--
-- Замер 19.08 на PROD снят соседним агентом: в `outgoing_delivery_queue` 113 строк `dead`, все
-- класса `recipient_blocked_bot`, накоплены с июня и не растут. На TEST в тот же день — 221 строка
-- `dead`. Триггер критического сигнала и «стоп»-баннера — `outgoingDelivery.deadTotal > 0`, без
-- окна (`apps/webapp/src/modules/operator-health/criticalHealthSignals.ts`). Строка `dead`
-- терминальна: она никогда не уходит сама. Значит один отказ в июне красит здоровье системы до
-- тех пор, пока человек руками не вычистит таблицу.
--
-- Чем это оплачено: ровно в эти двое суток телеграм отвечал `401` и настоящая двухсуточная
-- авария была неотличима от постоянного фона. Баннер, который горит всегда, не сообщает ничего —
-- он обучает не смотреть.
--
-- Миграция 0039 уже вынесла `recipient_blocked_bot` из `deadTotal` (заблокировавший бота человек —
-- не отказ механизма). Здесь закрывается вторая половина: у счётчика появляется ОКНО. Порог не
-- поднимается — поднятый порог даёт ровно ту же вечную красноту, только позже. Разделяются два
-- разных факта: «мёртвые строки появляются ПРЯМО СЕЙЧАС» (`deadRecent`, авария) и «мёртвые строки
-- когда-то были» (`deadTotal`, история). Алертит и красит первый; второй остаётся числом на
-- странице здоровья, потому что историю стирать нельзя — она и есть доказательство.
--
-- Окно — 24 часа, то же, что у `confirmedSentLast24h` в этом же корне и у суточной сводки. Более
-- короткое окно позволило бы отказу провалиться между двумя сводками и не быть названным ни в
-- одной; более длинное вернуло бы ту же незатухающую красноту в мягкой форме.
--
-- Момент смерти строки — `updated_at`: воркер переводит её в `dead` этой же записью. Новых прав
-- миграция не выдаёт: корень объявлен в 0039, владелец, сигнатура и грант EXECUTE те же.

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
           count(*) FILTER (WHERE is_operator_dead
             AND updated_at >= now() - interval '24 hours') AS dead_recent,
           max(updated_at) FILTER (WHERE is_operator_dead) AS last_operator_dead_at,
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
    'deadRecent', totals.dead_recent,
    'lastOperatorDeadAt', totals.last_operator_dead_at,
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
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Проба здоровья научилась называть отказ провайдера его настоящим классом
-- (`provider_auth_rejected` и соседи) и открывать инцидент в том же пространстве, где его открывает
-- настоящая отправка, — иначе владельческое «пейджить с первого появления» до пробы не доходило.
-- Значит выздоровевшая проба обязана уметь закрыть и такой инцидент, а старый список разрешённых
-- префиксов знал только `outbound:<интеграция>:`.
--
-- Ограничение по классу здесь не украшение. Успешный `getMe` доказывает, что учётные данные, квота
-- и настройка в порядке, — и НИЧЕГО не говорит про `provider_send_failed` конкретного сообщения.
-- Без этого условия соседняя удачная проверка тушила бы живой отказ отправки.
--
-- Прав никому не добавляется: владелец, сигнатура и единственный EXECUTE
-- (`app_operational_scheduler`) те же, что в `deploy/postgres/c4-operational-runtime.sql`.

CREATE OR REPLACE FUNCTION app.resolve_operator_probe_incidents(p_dedup_key_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_resolved integer;
  v_page_on_first_only boolean;
BEGIN
  IF p_dedup_key_prefix IS NULL
    OR p_dedup_key_prefix NOT IN (
      'outbound:max:', 'outbound:telegram:', 'outbound:google_calendar:',
      'outbound_delivery_provider:max:',
      'outbound_delivery_provider:telegram:',
      'outbound_delivery_provider:google_calendar:'
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
          'provider_auth_rejected', 'provider_not_configured'
        )
      )
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$function$;
