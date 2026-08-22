-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('record_reminder_occurrence_finalized_projection','record_integrator_support_delivery_attempt') AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%= ''app_integrator_request''%THEN ''app_integrator_request''::name%'
--
-- D17. Два корня обслуживают ДВЕ РАЗНЫЕ двери: одну открывает порт вебаппа, вторую — порт
-- интегратора.  До этой правки обе двери называли в гейте ОДНУ роль, `app_tenant_service` — роль
-- ВЕБАППА.  Интегратор ходил через чужую дверь: чтобы попасть в свой же корень, его логину
-- приходилось носить роль вебаппа, а вместе с ней — арендаторский стол вебаппа целиком.
--
-- Что меняется: гейт каждого корня ветвится ПО ДВЕРИ, и КАЖДАЯ ветка называет РОВНО ОДНУ роль.
-- Дверь вебаппа → `app_tenant_service`, дверь интегратора → `app_integrator_request`, дверь
-- долговечного повтора доставки (только у первого корня) → `app_operational_delivery_worker`.
-- Соответствие «дверь → роль» остаётся один к одному; ни одна ветка не принимает две роли, поэтому
-- ни один вызывающий не получает права ходить чужой дверью.
--
-- ПОЧЕМУ РАЗЛИЧИТЕЛЬ — GUC `role`, А НЕ КЛЮЧ ВОЗМОЖНОСТИ.  Ключ двери действительно различается
-- (`integrator_reminder_occurrence_finalized_record` у вебаппа против
-- `integrator_port_reminder_occurrence_finalized_record` у интегратора), но тело корня его не видит:
-- ключ и `capability_id` лежат в `app_ext.accepted_port_contexts`, а у владельцев этих швов
-- (`app_seam_reminder_patient_owner`, `app_seam_delivery_scope_owner`) нет ни SELECT на эту
-- таблицу, ни даже USAGE на схему `app_ext` (замерено на `bcb_webapp_dev`, обе роли — f/f).
-- Выдать им это право значило бы завести ВТОРОГО читателя принятого контекста рядом с
-- `app.require_accepted_context` — ровно тот дубль прохода, который запрещает AGENTS.md §5.
--
-- GUC `role` при этом НЕ «роль текущего сеанса на усмотрение вызывающего»: `app.begin_port_context`
-- ставит его оператором `SET LOCAL ROLE p_claims.target_role`, а `app.install_port_context` строкой
-- выше уже отверг claims, чей `target_role` разошёлся со строкой возможности.  Значит выбранная
-- ветка — это target_role именно той двери, которую открыл порт; и сама ветка всё равно обязана
-- найти принятый контекст на эту роль, иначе `app.require_accepted_context` отвечает 42501.
--
-- Форма взята дословно у уже живущего в репозитории гейта этого же первого корня (миграция
-- `20260820T112313_reminder_occurrence_delivery_capability.sql`), второй такой формы не заводим.
--
-- Тела взяты `pg_get_functiondef` с DEV — дословно из кластера, не набраны заново.  Сигнатура,
-- возврат, владелец, волатильность, `SECURITY DEFINER`, `search_path` и хеш типизированных
-- аргументов прежние, поэтому `CREATE OR REPLACE` сохраняет OID и ни одна ссылка `regprocedure`
-- не протухает.  Класс контекста у двери интегратора остаётся `tenant_service`: живой маршрут
-- ставит организационный принципал, а рантайм порта интегратора выбирает возможность именно по
-- паре (function_identity, contextClass).
--
-- EXECUTE и строки возможностей кладёт reconcile из `deploy/postgres/privileges/declaration.ts` —
-- миграция прав не выдаёт и не отзывает (AGENTS.md §1).
CREATE OR REPLACE FUNCTION app.record_reminder_occurrence_finalized_projection(p_integrator_occurrence_id text, p_integrator_rule_id text, p_integrator_user_id bigint, p_platform_user_id uuid, p_organization_id uuid, p_category text, p_status text, p_delivery_channel text, p_error_code text, p_occurred_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_patient_owner'::name,
    CASE
      WHEN pg_catalog.current_setting('role', true) = 'app_operational_delivery_worker'
        THEN 'app_operational_delivery_worker'::name
      WHEN pg_catalog.current_setting('role', true) = 'app_integrator_request'
        THEN 'app_integrator_request'::name
      ELSE 'app_tenant_service'::name
    END,
    CASE
      WHEN pg_catalog.current_setting('role', true) = 'app_operational_delivery_worker'
        THEN 'service'::app.port_context_class
      ELSE 'tenant_service'::app.port_context_class
    END,
    'integrator.reminder-occurrence-finalized.record',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg
    ]),
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active patient enrollment required for reminder occurrence projection';
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    integrator_occurrence_id,
    integrator_rule_id,
    integrator_user_id,
    platform_user_id,
    organization_id,
    category,
    status,
    delivery_channel,
    error_code,
    occurred_at
  ) VALUES (
    p_integrator_occurrence_id,
    p_integrator_rule_id,
    p_integrator_user_id,
    p_platform_user_id,
    p_organization_id,
    p_category,
    p_status,
    p_delivery_channel,
    p_error_code,
    p_occurred_at
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_integrator_support_delivery_attempt(p_organization_id uuid, p_integrator_intent_event_id text, p_correlation_id text, p_channel_code text, p_status text, p_attempt integer, p_reason text, p_payload_json text, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_id uuid;
  v_created boolean := false;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, CASE WHEN pg_catalog.current_setting('role', true) = 'app_integrator_request' THEN 'app_integrator_request'::name ELSE 'app_tenant_service'::name END, 'tenant_service'::app.port_context_class, 'integrator.support-delivery-attempt.record', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($9))::app.port_typed_arg]), 'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)'::regprocedure);

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'organization_context_required');
  END IF;

  INSERT INTO public.support_delivery_events (
    id,
    organization_id,
    conversation_message_id,
    integrator_intent_event_id,
    correlation_id,
    channel_code,
    status,
    attempt,
    reason,
    payload_json,
    occurred_at
  )
  VALUES (
    gen_random_uuid(),
    v_org,
    NULL,
    p_integrator_intent_event_id,
    p_correlation_id,
    p_channel_code,
    p_status,
    p_attempt,
    p_reason,
    COALESCE(p_payload_json::jsonb, '{}'::jsonb),
    p_occurred_at
  )
  ON CONFLICT (integrator_intent_event_id)
    WHERE integrator_intent_event_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    v_created := true;
  ELSIF p_integrator_intent_event_id IS NOT NULL THEN
    SELECT event.id
    INTO v_id
    FROM public.support_delivery_events AS event
    WHERE event.integrator_intent_event_id = p_integrator_intent_event_id
      AND event.organization_id = v_org
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'support_delivery_attempt_conflict');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'created', v_created);
END
$function$;
