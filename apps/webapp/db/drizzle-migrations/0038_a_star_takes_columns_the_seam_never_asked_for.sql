-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0038
--
-- Замер на TEST 19.08, роль `bcb_test_integrator`, каждые ~5 секунд:
--   42501 permission denied for table outgoing_delivery_queue
--   CONTEXT: SQL statement "SELECT * FROM public.outgoing_delivery_queue AS candidate ... FOR UPDATE"
--            PL/pgSQL function app.revalidate_patient_reminder_delivery_materialization(uuid) line 14
--
-- Отказ приходит НЕ вызывающему: 18.08 вызов уже завели под принципала доставки
-- (`runWithDeliveryWorkerPrincipal`), и EXECUTE проходит. Падает ТЕЛО корня, уже под владельцем шва
-- `app_seam_reminder_materialization_owner`: `SELECT *` (и `%ROWTYPE`) разворачивается в КАЖДУЮ
-- колонку отношения на разборе, а у владельца шва на этих трёх таблицах только объявленные
-- поколоночные гранты. Живая проверка на `bcb_webapp_dev`:
--   SET ROLE app_seam_reminder_materialization_owner;
--   SELECT * FROM public.outgoing_delivery_queue LIMIT 1;      -- ERROR 42501
--   SELECT id, event_id, kind, channel, status, organization_id
--     FROM public.outgoing_delivery_queue LIMIT 1;             -- 1 row
--
-- Это ровно тот класс, который миграция 0020 уже вылечила у трёх соседних корней шва
-- («A star expands to every column of the relation at parse time»). Этот корень тогда пропустили.
-- Лечение то же самое и по той же причине: сузить чтение до колонок, которые тело реально
-- использует, а НЕ выдавать шву недостающие колонки. Удержанные колонки — исход доставки
-- (`sent_at`, `failed_at`, `reclaim_count`, `last_attempt_at`, `failure_class`) и медицинские поля
-- пациента; ни одной из них тело не читает. Объявленные поверхности в
-- `deploy/postgres/privileges/declaration.ts` не меняются: перечисленные ниже колонки уже в них.
-- Прав не выдано никому: `FOR UPDATE` держится на поколоночном UPDATE, который у шва уже есть.

CREATE OR REPLACE FUNCTION app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  delivery record;
  occurrence record;
  rule record;
  expected_fingerprint text;
  current_fingerprint text;
  resolved_topic_code text;
  recipient text;
  channel_allowed boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  SELECT candidate.id, candidate.event_id, candidate.kind, candidate.channel,
         candidate.payload_json, candidate.status, candidate.organization_id
    INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
    AND candidate.kind = 'reminder_dispatch'
    AND candidate.status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT candidate.id, candidate.rule_id, candidate.status, candidate.organization_id,
         candidate.platform_user_id, candidate.delivery_generation
    INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = delivery.payload_json ->> 'occurrenceId';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT candidate.id, candidate.integrator_rule_id, candidate.platform_user_id,
         candidate.is_enabled, candidate.notification_topic_code, candidate.organization_id
    INTO rule
  FROM public.reminder_rules AS candidate
  WHERE candidate.integrator_rule_id = occurrence.rule_id;
  IF NOT FOUND THEN RETURN false; END IF;

  resolved_topic_code := delivery.payload_json ->> 'topicCode';
  recipient := CASE delivery.channel
    WHEN 'telegram' THEN delivery.payload_json #>> '{intent,payload,recipient,chatId}'
    WHEN 'max' THEN delivery.payload_json #>> '{intent,payload,recipient,userId}'
    WHEN 'email' THEN delivery.payload_json #>> '{intent,payload,recipient,email}'
    WHEN 'web_push' THEN delivery.payload_json #>> '{intent,payload,recipient,pushUserId}'
    ELSE NULL
  END;
  expected_fingerprint := delivery.payload_json ->> 'materializationFingerprint';
  current_fingerprint := app.patient_reminder_materialization_fingerprint(occurrence.id, delivery.channel);
  channel_allowed := CASE delivery.channel
    WHEN 'telegram' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'telegram'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'max' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'max'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'email' THEN EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id AND patient.email = recipient
        AND patient.email_verified_at IS NOT NULL
    )
    WHEN 'web_push' THEN recipient = occurrence.platform_user_id::text AND EXISTS (
      SELECT 1 FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = occurrence.platform_user_id
    )
    ELSE false
  END;

  IF delivery.organization_id = occurrence.organization_id
    AND occurrence.organization_id = rule.organization_id
    AND occurrence.platform_user_id = rule.platform_user_id
    AND resolved_topic_code = rule.notification_topic_code
    AND delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
    )
    AND (delivery.payload_json ->> 'deliveryGeneration')::integer = occurrence.delivery_generation
    AND delivery.payload_json ->> 'channel' = delivery.channel
    AND delivery.payload_json ->> 'externalId' = recipient
    AND occurrence.status IN ('queued', 'sent')
    AND rule.is_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reminder_journal AS journal
      WHERE journal.occurrence_id = occurrence.id AND journal.action IN ('done', 'skipped')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = occurrence.platform_user_id
        AND preference.channel_code = delivery.channel
        AND preference.is_enabled_for_notifications = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topics AS topic
      WHERE topic.user_id = occurrence.platform_user_id
        AND topic.topic_code = resolved_topic_code AND topic.is_enabled = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = occurrence.platform_user_id
        AND preference.topic_code = resolved_topic_code AND preference.channel_code = delivery.channel
        AND preference.is_enabled = false
    )
    AND channel_allowed
    AND expected_fingerprint ~ '^[0-9a-f]{32}$'
    AND current_fingerprint = expected_fingerprint
  THEN RETURN true; END IF;
  RETURN false;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Второй отказ того же дня, роль `bcb_test_webapp_staff`, ~12 раз подряд в минуту 09:00 КАЖДЫЙ день
-- начиная с 16.08:
--   42501 permission denied for table outgoing_delivery_queue
--   STATEMENT: select "sent_at" from "outgoing_delivery_queue" where kind = $1 and sent_at is not null
--              order by "sent_at" desc limit $2
--
-- Это `loadLatestSentOperatorHealthDigestAt` — ПЕРВЫЙ поход в базу суточной сводки здоровья, из
-- которого берётся начало окна сводки. Читает он очередь напрямую отношением, а на
-- `public.outgoing_delivery_queue` у `app_staff` нет НИ ОДНОЙ привилегии и по решению не должно
-- быть (`reminder-materialization-declaration.test.mjs`: «runtime roles cannot bypass ... the queue
-- root»). Отказ не перехвачен, `runOperatorHealthDigestTick` падает целиком — сводка оператора не
-- уходила ни разу; молчание сводки выглядит ровно как спокойный день.
--
-- Принципала, которому можно читать очередь, у вебаппа нет: логин порта состоит в `app_worker`, а
-- SELECT на очереди держит только `app_operational_delivery_worker` (членства нет и не будет —
-- это роль интегратора). Поэтому чтение идёт объявленным корнем от владельца шва операторской
-- телеметрии — тем же, что уже владеет разбором очереди в `app.archive_operator_health_failures`.
-- Форма дословно по соседу `app.prune_operator_health_failure_archive(integer)`: тот же шов, тот же
-- `app_worker`, тот же класс контекста. Рабочая роль получает только EXECUTE; на таблице к
-- поколоночным грантам шва добавляется единственная колонка `sent_at`.

CREATE OR REPLACE FUNCTION app.read_operator_health_digest_last_sent_at()
RETURNS timestamp with time zone
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  last_sent_at timestamp with time zone;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.digest.last-sent.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_operator_health_digest_last_sent_at()'::regprocedure
  );

  -- Пульс сводки — ПОДТВЕРЖДЁННАЯ отправка (`sent_at`), а не факт постановки в очередь: окно
  -- следующей сводки обязано снова накрыть события, о которых оператору так и не сообщили.
  SELECT max(digest.sent_at) INTO last_sent_at
  FROM public.outgoing_delivery_queue AS digest
  WHERE digest.kind = 'operator_health_digest'
    AND digest.sent_at IS NOT NULL;

  RETURN last_sent_at;
END
$function$;
