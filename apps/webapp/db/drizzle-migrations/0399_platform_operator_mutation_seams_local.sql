-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Platform operators receive exact mutation roots, never direct DML on operator queues/incidents.
CREATE OR REPLACE FUNCTION app.resolve_platform_audit_conflict(p_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  audit_row record;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'platform audit conflict id is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT audit.action, audit.resolved_at
  INTO audit_row
  FROM public.admin_audit_log AS audit
  WHERE audit.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF audit_row.resolved_at IS NOT NULL THEN RETURN 'already_resolved'; END IF;
  IF audit_row.action NOT IN (
    'auto_merge_conflict',
    'auto_merge_conflict_anomaly',
    'email_auth_conflict',
    'messenger_phone_bind_blocked',
    'messenger_phone_bind_anomaly',
    'channel_link_ownership_conflict'
  ) THEN
    RETURN 'not_closeable';
  END IF;

  UPDATE public.admin_audit_log AS audit
  SET resolved_at = now()
  WHERE audit.id = p_id;
  RETURN 'updated';
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.append_platform_audit_event(
  p_action text,
  p_details text,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  inserted_id uuid;
  details_json jsonb;
BEGIN
  details_json := p_details::jsonb;
  IF p_action IS NULL
    OR p_action NOT IN (
      'operator_incidents_acknowledge_all',
      'operator_incidents_resolve_all',
      'health_failure_archive_clear_dead'
    )
    OR p_details IS NULL
    OR pg_catalog.jsonb_typeof(details_json) <> 'object'
    OR pg_catalog.pg_column_size(details_json) > 65536
    OR p_status IS NULL
    OR p_status NOT IN ('ok', 'partial_failure', 'error')
  THEN
    RAISE EXCEPTION 'invalid platform audit event'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, details, status
  ) VALUES (
    NULL, app.current_actor_user_id(), p_action, details_json, p_status
  )
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.acknowledge_open_outbound_provider_incidents()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  changed_count bigint;
BEGIN
  WITH changed AS (
    UPDATE public.operator_incidents AS incident
    SET acknowledged_at = now(),
        alert_claim_phase = NULL,
        alert_claim_token = NULL,
        alert_claimed_at = NULL
    WHERE incident.resolved_at IS NULL
      AND incident.acknowledged_at IS NULL
      AND incident.direction = 'outbound_delivery_provider'
    RETURNING 1
  )
  SELECT count(*) INTO changed_count FROM changed;
  RETURN changed_count;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Cross-clinic platform view is sanitized inside the seam. Historical rows may contain patient or
-- doctor identifiers in summary_json even when organization_id is NULL; none are returned here.
CREATE OR REPLACE FUNCTION app.list_platform_health_failure_archive(
  p_probe text,
  p_limit integer,
  p_cursor_at timestamptz,
  p_cursor_id uuid
)
RETURNS TABLE(
  id uuid,
  archived_at timestamptz,
  archived_by_user_id uuid,
  health_probe text,
  source_kind text,
  source_id text,
  severity_at_archive text,
  summary_json jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF (p_probe IS NOT NULL AND p_probe NOT IN (
      'outgoing_delivery',
      'integrator_push_outbox',
      'projection_outbox',
      'outgoing_reminder_dispatch'
    ))
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 101
    OR ((p_cursor_at IS NULL) <> (p_cursor_id IS NULL))
  THEN
    RAISE EXCEPTION 'invalid platform health archive query'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    archive.id,
    archive.archived_at,
    archive.archived_by_user_id,
    archive.health_probe,
    archive.source_kind,
    archive.source_id,
    archive.severity_at_archive,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'reason_code', archive.summary_json -> 'reason_code',
      'reason_ru', archive.summary_json -> 'reason_ru',
      'channel', archive.summary_json -> 'channel',
      'queue_kind', archive.summary_json -> 'queue_kind',
      'event_type', archive.summary_json -> 'event_type',
      'attempts_done', archive.summary_json -> 'attempts_done'
    ))
  FROM public.operator_health_failure_archive AS archive
  WHERE (p_probe IS NULL OR archive.health_probe = p_probe)
    AND (
      p_cursor_at IS NULL
      OR archive.archived_at < p_cursor_at
      OR (archive.archived_at = p_cursor_at AND archive.id < p_cursor_id)
    )
  ORDER BY archive.archived_at DESC, archive.id DESC
  LIMIT p_limit;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.resolve_all_open_operator_incidents()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  changed_count bigint;
BEGIN
  WITH changed AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now(),
        alert_claim_phase = NULL,
        alert_claim_token = NULL,
        alert_claimed_at = NULL
    WHERE incident.resolved_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO changed_count FROM changed;
  RETURN changed_count;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Moves one locked batch into the archive and deletes only rows that were inserted there.
-- Queue payloads stay inside PostgreSQL; the caller receives counts only. Tenant rows keep their
-- organization_id, so platform archive reads cannot turn clinic failures into global rows.
CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(
  p_probe text,
  p_limit integer,
  p_archived_by_user_id uuid
)
RETURNS TABLE(inserted_count bigint, deleted_count bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_probe IS NULL
    OR p_probe NOT IN (
      'outgoing_delivery',
      'integrator_push_outbox',
      'projection_outbox',
      'outgoing_reminder_dispatch'
    )
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 500
    OR p_archived_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid operator health archive input'
      USING ERRCODE = '23514';
  END IF;

  IF p_probe IN ('outgoing_delivery', 'outgoing_reminder_dispatch') THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT queue.*
      FROM public.outgoing_delivery_queue AS queue
      WHERE queue.status = 'dead'
        AND queue.organization_id IS NULL
        AND (queue.failure_class IS NULL OR queue.failure_class <> 'recipient_blocked_bot')
        AND CASE
          WHEN p_probe = 'outgoing_reminder_dispatch' THEN queue.kind = 'reminder_dispatch'
          ELSE queue.kind <> 'reminder_dispatch'
        END
      ORDER BY queue.created_at, queue.id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    ), archived AS (
      INSERT INTO public.operator_health_failure_archive (
        organization_id,
        archived_by_user_id,
        health_probe,
        source_kind,
        source_id,
        severity_at_archive,
        doctor_user_id,
        summary_json,
        raw_error_truncated
      )
      SELECT
        NULL,
        p_archived_by_user_id,
        p_probe,
        'outgoing_delivery_queue_row',
        candidate.id::text,
        'dead',
        NULL,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'reason_code', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'unknown_delivery_error'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'BAD_PAYLOAD'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'MISSING_BROADCAST_AUDIT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'MISSING_INCIDENT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'MISSING_REMINDER_FIELDS'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'UNKNOWN_KIND'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'broadcast_delivery_cap_exceeded'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'timeout'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'network'
            ELSE 'unknown_delivery_error'
          END,
          'reason_ru', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'Причина не указана'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'Некорректные данные задачи (payload)'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'В задаче нет идентификатора журнала рассылки'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'В задаче операторского алерта нет incident_id'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'Не хватает полей для доставки напоминания'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'Неизвестный тип задачи в очереди'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'Превышен лимит строк доставки на одну рассылку'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'Таймаут при обращении к внешнему API'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'Сетевая ошибка / недоступен узел'
            ELSE 'Ошибка доставки (см. усечённый текст)'
          END,
          'channel', candidate.channel,
          'queue_kind', candidate.kind,
          'health_scope', 'platform'
        )),
        NULLIF(pg_catalog.left(candidate.last_error, 512), '')
      FROM candidates AS candidate
      RETURNING source_id
    ), deleted AS (
      DELETE FROM public.outgoing_delivery_queue AS queue
      USING archived
      WHERE queue.id::text = archived.source_id
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM archived),
      (SELECT count(*) FROM deleted);
    RETURN;
  END IF;

  IF p_probe = 'integrator_push_outbox' THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT outbox.*
      FROM public.integrator_push_outbox AS outbox
      WHERE outbox.status = 'dead'
        AND NOT (
          outbox.payload ? 'organizationId'
          OR outbox.payload ? 'organization_id'
          OR outbox.payload ? 'platformUserId'
          OR outbox.payload ? 'platform_user_id'
        )
      ORDER BY outbox.created_at, outbox.id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    ), archived AS (
      INSERT INTO public.operator_health_failure_archive (
        organization_id, archived_by_user_id, health_probe, source_kind, source_id,
        severity_at_archive, doctor_user_id, summary_json, raw_error_truncated
      )
      SELECT
        NULL, p_archived_by_user_id, p_probe, 'integrator_push_outbox_row', candidate.id::text,
        'dead', NULL,
        pg_catalog.jsonb_build_object(
          'reason_code', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'unknown_delivery_error'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT)' THEN 'timeout'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND)' THEN 'network'
            ELSE 'unknown_delivery_error'
          END,
          'reason_ru', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'Причина не указана'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT)' THEN 'Таймаут signed POST в integrator'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND)' THEN 'Сеть: integrator недоступен'
            ELSE 'Сбой синка в integrator (см. усечённый текст)'
          END,
          'queue_kind', candidate.kind
        ),
        NULLIF(pg_catalog.left(candidate.last_error, 512), '')
      FROM candidates AS candidate
      RETURNING source_id
    ), deleted AS (
      DELETE FROM public.integrator_push_outbox AS outbox
      USING archived
      WHERE outbox.id::text = archived.source_id
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM archived),
      (SELECT count(*) FROM deleted);
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT outbox.*
    FROM integrator.projection_outbox AS outbox
    WHERE outbox.status = 'dead'
      AND NOT (
        outbox.payload ? 'organizationId'
        OR outbox.payload ? 'organization_id'
        OR outbox.payload ? 'platformUserId'
        OR outbox.payload ? 'platform_user_id'
      )
    ORDER BY outbox.created_at, outbox.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), archived AS (
    INSERT INTO public.operator_health_failure_archive (
      organization_id, archived_by_user_id, health_probe, source_kind, source_id,
      severity_at_archive, doctor_user_id, summary_json, raw_error_truncated
    )
    SELECT
      NULL, p_archived_by_user_id, p_probe, 'projection_outbox_row', candidate.id::text,
      'dead', NULL,
      pg_catalog.jsonb_build_object(
        'event_type', candidate.event_type,
        'idempotency_key', candidate.idempotency_key,
        'attempts_done', candidate.attempts_done
      ),
      NULLIF(pg_catalog.left(candidate.last_error, 512), '')
    FROM candidates AS candidate
    RETURNING source_id
  ), deleted AS (
    DELETE FROM integrator.projection_outbox AS outbox
    USING archived
    WHERE outbox.id::text = archived.source_id
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM archived),
    (SELECT count(*) FROM deleted);
END
$function$;
