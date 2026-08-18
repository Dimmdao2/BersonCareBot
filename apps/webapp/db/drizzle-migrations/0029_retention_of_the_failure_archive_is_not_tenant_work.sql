-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0029
--
-- TTL-подметание `public.operator_health_failure_archive` — работа НАД арендаторами, а не работа
-- одного арендатора: она удаляет просроченные строки всех организаций сразу. До этой миграции она
-- шла обычным relation-DELETE от `app_operational_maintenance`, а единственная разрешающая
-- runtime-политика этой таблицы (`rev10_saas_org_dormant_p0_8_3`) требует `app_staff` И принятый
-- организационный контекст. Пока `app.current_org_id()` была VOLATILE, гейт считался построчно, и
-- statement, не нашедший ни одной строки, просто ничего не делал — подметание было тихим no-op.
-- После перевода `app.current_org_id()` в STABLE тот же квал поднялся в InitPlan и считается один
-- раз на statement, поэтому DELETE стал падать `42501 accepted organization context required`
-- (в логе `bersoncarebot_test` — каждые ~10 минут, тик `system-health-guard`).
--
-- Ослаблять политику или выдавать роли больше прав нельзя: это стена арендатора. Две другие
-- операции над этой же таблицей (`app.archive_operator_health_failures`,
-- `app.list_platform_health_failure_archive`) уже ходят именованными корнями от владельца шва
-- `app_seam_telemetry_operator_owner`, у которого на таблице есть собственная политика
-- `rev10_seam_business_128`. Подметание получает ровно такой же корень — дословно по образцу
-- соседа `app.prune_integration_webhook_error_events(integer)`, который живёт в том же тике
-- обслуживания и работает корректно.
--
-- `BCB-MIGRATION-SCHEMA-CREATE: app` и `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` обязательны:
-- без них мигратор не выдаёт владельцу шва CREATE на схему `app`.

CREATE OR REPLACE FUNCTION app.prune_operator_health_failure_archive(p_retention_days integer)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.failure-archive.prune',
    app.hash_port_typed_args(ARRAY[ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg]),
    'app.prune_operator_health_failure_archive(integer)'::regprocedure
  );

  IF p_retention_days IS NULL
    OR p_retention_days < 1
    OR p_retention_days > 3650
  THEN
    RAISE EXCEPTION 'invalid health failure archive retention'
      USING ERRCODE = '23514';
  END IF;

  WITH deleted AS (
    DELETE FROM public.operator_health_failure_archive AS archived
    WHERE archived.archived_at < now() - make_interval(days => p_retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END
$function$;

REVOKE ALL ON FUNCTION app.prune_operator_health_failure_archive(integer) FROM PUBLIC;
