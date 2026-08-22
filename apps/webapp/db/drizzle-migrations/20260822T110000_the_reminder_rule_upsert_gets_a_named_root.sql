-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean)') IS NOT NULL
--
-- D17 шаг 1 (1/6). `writeReminderRulesDirect.ts` писал `public.reminder_rules` реляционно под
-- `app_tenant_service` и тут же снимал непрожитые вхождения из `integrator.user_reminder_occurrences`
-- в одной транзакции. Тот же результат теперь даёт один именованный корень: обе записи остаются
-- атомарными внутри тела функции, а логину интегратора табличная запись в канон больше не нужна.
--
-- Тело исполняется владельцем шва `app_seam_reminder_patient_owner` и потому обходит RLS — поэтому
-- стена арендатора повторена здесь ДОСЛОВНО по политикам `rev10_tenant_insert_173`,
-- `rev10_tenant_update_173` и `rev10_tenant_delete_17`: организация обязана совпасть с принятым
-- контекстом, а платформенный пользователь — быть активным сотрудником либо активно записанным
-- пациентом ЭТОЙ организации. Гранты и политики остаются исключительно за
-- deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_upsert_reminder_rule(
  p_integrator_rule_id text,
  p_platform_user_id text,
  p_organization_id uuid,
  p_integrator_user_id bigint,
  p_category text,
  p_is_enabled boolean,
  p_schedule_type text,
  p_timezone text,
  p_interval_minutes integer,
  p_window_start_minute integer,
  p_window_end_minute integer,
  p_days_mask text,
  p_content_mode text,
  p_linked_object_type text,
  p_linked_object_id text,
  p_custom_title text,
  p_custom_text text,
  p_schedule_data text,
  p_reminder_intent text,
  p_quiet_hours_start_minute integer,
  p_quiet_hours_end_minute integer,
  p_notification_topic_code text,
  p_notification_topic_code_provided boolean
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_platform_user_id uuid;
  v_updated_at text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_patient_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.reminder-rule.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($9))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($10))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($11))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($12))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($13))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($14))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($15))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($16))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($17))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($18))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($19))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($20))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($21))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($22))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend($23))::app.port_typed_arg
    ]),
    'app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure
  );

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_reminder_rule_upsert_principal_required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_reminder_rule_upsert_principal_mismatch' USING ERRCODE = '42501';
  END IF;

  v_platform_user_id := p_platform_user_id::uuid;

  -- rev10_tenant_insert_173 / rev10_tenant_update_173, дословно.
  IF v_platform_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = v_platform_user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = v_platform_user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    )
  THEN
    RAISE EXCEPTION 'integrator_reminder_rule_upsert_platform_user_outside_organization'
      USING ERRCODE = '42501';
  END IF;

  -- USING-половина `rev10_tenant_update_173`: существующая строка чужой организации сегодня
  -- невидима арендатору, и `ON CONFLICT DO UPDATE` по ней отказывает. Тот же отказ — здесь.
  IF EXISTS (
    SELECT 1 FROM public.reminder_rules AS existing_rule
    WHERE existing_rule.integrator_rule_id = p_integrator_rule_id
      AND existing_rule.organization_id IS DISTINCT FROM p_organization_id
  ) THEN
    RAISE EXCEPTION 'integrator_reminder_rule_upsert_row_outside_organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.reminder_rules (
    integrator_rule_id, platform_user_id, organization_id, integrator_user_id, category, is_enabled,
    schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
    days_mask, content_mode,
    linked_object_type, linked_object_id, custom_title, custom_text,
    schedule_data, reminder_intent, quiet_hours_start_minute, quiet_hours_end_minute,
    notification_topic_code, updated_at
  ) VALUES (
    p_integrator_rule_id, v_platform_user_id, p_organization_id, p_integrator_user_id, p_category, p_is_enabled,
    p_schedule_type, p_timezone, p_interval_minutes, p_window_start_minute, p_window_end_minute,
    p_days_mask, p_content_mode,
    p_linked_object_type, p_linked_object_id, p_custom_title, p_custom_text,
    p_schedule_data::jsonb, p_reminder_intent, p_quiet_hours_start_minute, p_quiet_hours_end_minute,
    p_notification_topic_code, now()
  )
  ON CONFLICT (integrator_rule_id) DO UPDATE SET
    platform_user_id = COALESCE(EXCLUDED.platform_user_id, reminder_rules.platform_user_id),
    organization_id = COALESCE(EXCLUDED.organization_id, reminder_rules.organization_id),
    integrator_user_id = EXCLUDED.integrator_user_id,
    category = EXCLUDED.category,
    is_enabled = EXCLUDED.is_enabled,
    schedule_type = EXCLUDED.schedule_type,
    timezone = EXCLUDED.timezone,
    interval_minutes = EXCLUDED.interval_minutes,
    window_start_minute = EXCLUDED.window_start_minute,
    window_end_minute = EXCLUDED.window_end_minute,
    days_mask = EXCLUDED.days_mask,
    content_mode = EXCLUDED.content_mode,
    linked_object_type = EXCLUDED.linked_object_type,
    linked_object_id = EXCLUDED.linked_object_id,
    custom_title = EXCLUDED.custom_title,
    custom_text = EXCLUDED.custom_text,
    schedule_data = EXCLUDED.schedule_data,
    reminder_intent = EXCLUDED.reminder_intent,
    quiet_hours_start_minute = EXCLUDED.quiet_hours_start_minute,
    quiet_hours_end_minute = EXCLUDED.quiet_hours_end_minute,
    notification_topic_code = CASE
      WHEN p_notification_topic_code_provided THEN EXCLUDED.notification_topic_code
      ELSE reminder_rules.notification_topic_code END,
    updated_at = EXCLUDED.updated_at
  RETURNING reminder_rules.updated_at::text INTO v_updated_at;

  IF v_updated_at IS NULL THEN
    RAISE EXCEPTION 'integrator_reminder_rule_upsert_returned_no_row' USING ERRCODE = '42501';
  END IF;

  -- rev10_tenant_delete_17: снятие непрожитых вхождений остаётся в границах той же организации.
  DELETE FROM integrator.user_reminder_occurrences AS occurrence
  WHERE occurrence.rule_id = p_integrator_rule_id
    AND occurrence.status IN ('planned', 'queued')
    AND occurrence.organization_id = p_organization_id;

  RETURN v_updated_at;
END
$function$;
