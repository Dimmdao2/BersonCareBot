-- BCB-MIGRATION-OWNER: app_seam_retention_sweep_owner
-- BCB-MIGRATION-VERIFY: (SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) LIKE '%media_upload_sessions_completed%' AND (SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) LIKE '%saas_isolation_events_resolved%' AND (SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.prune_retention_target(text,integer,boolean)'))) LIKE '%saas_isolation_coverage_runs%'
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- #1088. Четыре таблицы стояли в реестре жизненного цикла с пометкой «вопрос владельцу»: механика
-- готова, числа нет. Владелец 12.09 закрыл вопрос, в том числе там, где числа не назвал:
-- «Надо решить, блядь, сколько это хранят, просто. Нормальная, ребята, ну, как бы, взрослые
-- систем, блядь, так и настроить, так и сделать». Числа взяты не с потолка — основание каждого
-- окна записано у своей ветки ниже и в `journal-lifecycle-registry.ts`.
--
-- Ветка добавляется только вместе с объявленной поверхностью в
-- `deploy/postgres/privileges/declaration.ts` — это записано в самом теле функции, и здесь
-- поверхности расширены тем же ходом.
CREATE OR REPLACE FUNCTION app.prune_retention_target(p_target text, p_retention_days integer, p_dry_run boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  affected_count bigint;
  cutoff_at timestamptz;
  -- A first catch-up run must not hold one long DELETE lock on a multi-million-row backlog (same
  -- reasoning as app.prune_context_nonce_ledger's p_limit). Every branch added by Track D final
  -- cutover (#987) below caps its DELETE at this many rows per invocation; the hourly tick catches
  -- up over repeated calls instead of issuing one unbounded backlog DELETE.
  batch_limit CONSTANT bigint := 200000;
BEGIN
  PERFORM app.require_accepted_context('app_seam_retention_sweep_owner'::name, 'app_operational_maintenance'::name, 'service'::app.port_context_class, 'retention.locked-tenant-table.sweep', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.prune_retention_target(text,integer,boolean)'::regprocedure);

  IF p_retention_days IS NULL
    OR p_retention_days < 1
    OR p_retention_days > 3650
  THEN
    RAISE EXCEPTION 'invalid retention window'
      USING ERRCODE = '23514';
  END IF;

  IF p_dry_run IS NULL THEN
    RAISE EXCEPTION 'retention dry-run flag is required'
      USING ERRCODE = '23514';
  END IF;

  cutoff_at := now() - make_interval(days => p_retention_days);

  -- ЗАКРЫТЫЙ СПИСОК. Ветка добавляется только вместе с объявленной поверхностью в
  -- deploy/postgres/privileges/declaration.ts; всё остальное отказывает ниже в ELSE.
  CASE p_target
    WHEN 'media_hls_proxy_error_events' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.media_hls_proxy_error_events AS expiring
         WHERE expiring.created_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.media_hls_proxy_error_events AS expiring
           WHERE expiring.created_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_analytics_events_recent' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_analytics_events_recent AS expiring
         WHERE expiring.occurred_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_analytics_events_recent AS expiring
           WHERE expiring.occurred_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_analytics_user_hourly' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_analytics_user_hourly AS expiring
         WHERE expiring.bucket_hour < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_analytics_user_hourly AS expiring
           WHERE expiring.bucket_hour < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'product_push_notifications' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM public.product_push_notifications AS expiring
         WHERE expiring.created_at < cutoff_at;
      ELSE
        WITH deleted AS (
          DELETE FROM public.product_push_notifications AS expiring
           WHERE expiring.created_at < cutoff_at
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'public_idempotency_keys' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.idempotency_keys AS expiring
             WHERE expiring.expires_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.key
            FROM public.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.idempotency_keys AS target
           USING victims
           WHERE target.key = victims.key
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'integrator_idempotency_keys' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM integrator.idempotency_keys AS expiring
             WHERE expiring.expires_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.key
            FROM integrator.idempotency_keys AS expiring
           WHERE expiring.expires_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM integrator.idempotency_keys AS target
           USING victims
           WHERE target.key = victims.key
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_sent' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.outgoing_delivery_queue AS expiring
             WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'sent' AND expiring.sent_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'outgoing_delivery_queue_dead' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.outgoing_delivery_queue AS expiring
             WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.outgoing_delivery_queue AS expiring
           WHERE expiring.status = 'dead' AND expiring.dead_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.outgoing_delivery_queue AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'notification_delivery_attempts' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.notification_delivery_attempts AS expiring
             WHERE expiring.created_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.notification_delivery_attempts AS expiring
           WHERE expiring.created_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.notification_delivery_attempts AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'reminder_occurrence_history_terminal' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.reminder_occurrence_history AS expiring
             WHERE expiring.status IN ('sent', 'failed', 'skipped')
               AND expiring.planned_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.reminder_occurrence_history AS expiring
           WHERE expiring.status IN ('sent', 'failed', 'skipped')
             AND expiring.planned_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.reminder_occurrence_history AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    WHEN 'message_log' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.message_log AS expiring
             WHERE expiring.sent_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.message_log AS expiring
           WHERE expiring.sent_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.message_log AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    -- #1088. Завершённая передача файла. Владелец 12.09 дословно: «Завершенные загрузки файлов…
    -- мы уже решили, что файлы мы не удаляем… не трогаем файлы… у нас же есть отметка о том, чей
    -- это файл, кто его загрузил… ну, давай год хранить». Здесь удаляется НЕ файл: строка сессии —
    -- бухгалтерия передачи (`s3_key` + `upload_id`), а отметка «кто загрузил» живёт в
    -- `media_files.uploaded_by` и не стареет никогда.
    --
    -- Только `completed`. У завершённой загрузки multipart уже собран в объект — отменять нечего,
    -- и личность повтора ничего не стоит. `aborted`/`expired`/`failed` наоборот: строка сессии —
    -- ЕДИНСТВЕННЫЙ держатель `s3_key` + `upload_id` незавершённой загрузки, и умирает она каскадом
    -- от своей `media_files` ровно тогда, когда отмена в S3 подтверждена (см. §D1 в
    -- mediaUploadSessionsRepo.stageExpiredMultipartSessionForPurgeTx). Возраст не должен обгонять
    -- эту отмену, иначе куски останутся в бакете, и назвать их будет нечем.
    WHEN 'media_upload_sessions_completed' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.media_upload_sessions AS expiring
             WHERE expiring.status = 'completed'
               AND expiring.updated_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.media_upload_sessions AS expiring
           WHERE expiring.status = 'completed'
             AND expiring.updated_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.media_upload_sessions AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    -- #1088. Телеметрия нарушения изоляции арендаторов — это журнал БЕЗОПАСНОСТИ, и год для него
    -- не выдумка: год держат и PCI DSS 10.7 (из них квартал — «немедленно доступными»), и типовые
    -- требования киберстраховщиков. Поэтому окно 365 дней.
    --
    -- Условие возраста считается от `resolved_at`, и НЕРАЗОБРАННОЕ не удаляется никогда, каким бы
    -- старым оно ни было: строка здесь дедуплицирована по `fingerprint` и живёт как открытый
    -- случай (`lifecycle_status`, `occurrence_count`, `first_seen_at`…), а не как сырое событие.
    -- Тикающий год не должен закрывать случай за людей. Почасовая свёртка уходит каскадом:
    -- `saas_isolation_event_hourly.event_id` ссылается сюда с ON DELETE CASCADE.
    WHEN 'saas_isolation_events_resolved' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.saas_isolation_events AS expiring
             WHERE expiring.lifecycle_status = 'resolved'
               AND expiring.resolved_at IS NOT NULL
               AND expiring.resolved_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.saas_isolation_events AS expiring
           WHERE expiring.lifecycle_status = 'resolved'
             AND expiring.resolved_at IS NOT NULL
             AND expiring.resolved_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.saas_isolation_events AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    -- #1088. Прогон проверки покрытия изоляции — тот же класс безопасности и то же окно 365 дней.
    -- Незавершённый прогон (`finished_at IS NULL`) не трогается: он либо ещё идёт, либо оборвался,
    -- и в обоих случаях это находка для оператора, а не мусор по возрасту.
    WHEN 'saas_isolation_coverage_runs' THEN
      IF p_dry_run THEN
        SELECT count(*) INTO affected_count
          FROM (
            SELECT 1 FROM public.saas_isolation_coverage_runs AS expiring
             WHERE expiring.finished_at IS NOT NULL
               AND expiring.finished_at < cutoff_at
             LIMIT batch_limit
          ) AS capped;
      ELSE
        WITH victims AS (
          SELECT expiring.id
            FROM public.saas_isolation_coverage_runs AS expiring
           WHERE expiring.finished_at IS NOT NULL
             AND expiring.finished_at < cutoff_at
           LIMIT batch_limit
        ),
        deleted AS (
          DELETE FROM public.saas_isolation_coverage_runs AS target
           USING victims
           WHERE target.id = victims.id
          RETURNING 1
        )
        SELECT count(*) INTO affected_count FROM deleted;
      END IF;

    ELSE
      RAISE EXCEPTION 'unknown retention target %', p_target
        USING ERRCODE = '22023';
  END CASE;

  RETURN affected_count;
END
$function$;
