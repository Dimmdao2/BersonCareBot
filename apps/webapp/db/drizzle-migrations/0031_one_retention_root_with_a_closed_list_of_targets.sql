-- BCB-MIGRATION-OWNER: app_seam_retention_sweep_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0031
--
-- Уборка по сроку хранения не работала НИ РАЗУ на четырёх запертых арендаторских таблицах
-- (`docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md`). Механика та же, что уже разобрана в
-- миграции 0029: единственная разрешающая runtime-политика этих таблиц
-- (`rev10_saas_org_dormant_p0_8_3`) требует `app_staff` И совпадения организации, а фоновая
-- уборка чистит записи всех клиник разом и организации не имеет. Право DELETE у
-- `app_operational_maintenance` было мёртвым с рождения: пока `app.current_org_id()` была
-- VOLATILE, квал считался построчно и statement, не нашедший строк, молча рапортовал успех;
-- после перевода в STABLE тот же квал поднялся в InitPlan и DELETE стал падать 42501.
--
-- Решение владельца 19.08: не пять новых функций, а ОДНА с параметром и ЗАКРЫТЫМ списком —
-- «уборка — это одинаковое действие, и не хочется плодить дубли», «закрытый список — супер».
--
-- Цель приходит ТЕКСТОВОЙ МЕТКОЙ и разворачивается ветками `CASE` внутри тела: каждая ветка —
-- статический DELETE по одной названной таблице. Динамической склейки имени таблицы здесь нет
-- и быть не может: этот корень исполняется с правами владельца шва, и подстановка
-- идентификатора, пришедшего от вызывающего, превратила бы его в отмычку ко всей базе.
-- Незнакомая метка не исполняется, а отказывает (22023) — в этом весь смысл закрытого списка.
--
-- Владелец шва — отдельная роль `app_seam_retention_sweep_owner`, которая владеет ровно этой
-- одной функцией и достаёт ровно до этих четырёх таблиц. Занять под неё соседнего владельца
-- (`app_seam_telemetry_patient_owner` или `saas_system_health_owner`) значило бы расширить его
-- шов на чужую заботу — ровно то, ради сужения чего именованные корни и существуют.
--
-- Окно хранения приходит параметром: числа остаются там, где они объявлены сегодня
-- (`hlsProxyErrorEvents.ts`, `productAnalyticsRetention.ts`), тик передаёт свою константу.
-- Границы 1..3650 суток — как в 0029.
--
-- `BCB-MIGRATION-SCHEMA-CREATE: app` и `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` обязательны:
-- без них мигратор не выдаёт владельцу шва CREATE на схему `app`.

CREATE OR REPLACE FUNCTION app.prune_retention_target(
  p_target text,
  p_retention_days integer,
  p_dry_run boolean
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  affected_count bigint;
  cutoff_at timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_retention_sweep_owner'::name,
    'app_operational_maintenance'::name,
    'service'::app.port_context_class,
    'retention.locked-tenant-table.sweep',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]),
    'app.prune_retention_target(text,integer,boolean)'::regprocedure
  );

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

    ELSE
      RAISE EXCEPTION 'unknown retention target %', p_target
        USING ERRCODE = '22023';
  END CASE;

  RETURN affected_count;
END
$function$;

-- Прав в этой миграции нет и быть не может: `GRANT`, `REVOKE` и любое иное изменение прав в файле
-- миграции запрещены полностью (AGENTS.md §1 «Миграция не выдаёт и не отзывает права. Никогда»).
-- Отзыв у PUBLIC и у всех рантайм-ролей, как и единственный GRANT EXECUTE, приходит следующим шагом
-- того же прогона — из `deploy/postgres/generated/privileges.<база>.sql`, который применяет reconcile.
-- Тут это ещё и единственный работающий порядок: владелец шва `app_seam_retention_sweep_owner`
-- рождается вместе с этой работой и на момент миграции не имеет USAGE на схему `app`.
