-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 10 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('integrator_upsert_reminder_rule','integrator_record_notification_delivery_attempt','integrator_increment_broadcast_audit_counter','integrator_set_user_channel_bot_blocked','integrator_record_messenger_phone_bind_audit','get_google_calendar_event_id','upsert_google_calendar_event_id','delete_google_calendar_event_id','read_booking_calendar_patient_profile','read_booking_calendar_latest_staff_comment') AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%''app_integrator_request''::name, ''tenant_service''::app.port_context_class%'
--
-- D17 финал. Интегратор ходил в базу под РОЛЬЮ ВЕБАППА: десять именованных корней, которыми он
-- пишет и читает продуктовый канон, называли в гейте `app_tenant_service` — ту самую роль, которую
-- носит логин вебаппа `bcb_*_webapp_staff`. Своя роль у интегратора есть и её не носит никто
-- другой — `app_integrator_request`; теперь гейт называет её.
--
-- Меняется РОВНО ОДИН аргумент `app.require_accepted_context` в каждом теле — имя законного
-- вызывающего. Сигнатура, возврат, владелец, волатильность, `SECURITY DEFINER`, `search_path`,
-- класс контекста (`tenant_service` — организационный принципал никуда не делся), назначение и
-- хеш типизированных аргументов остаются дословно прежними, поэтому `CREATE OR REPLACE` сохраняет
-- OID и ни одна ссылка `regprocedure` не протухает.
--
-- Гейт по-прежнему называет РОВНО ОДНОГО законного вызывающего: списка ролей здесь нет и не
-- появляется. Тела взяты `pg_get_functiondef` с DEV, то есть дословно из кластера, а не набраны
-- заново.
--
-- Право EXECUTE у `app_tenant_service` на эти десять корней снимает reconcile из
-- `deploy/postgres/privileges/declaration.ts` — миграция прав не выдаёт и не отзывает (AGENTS.md §1).
CREATE OR REPLACE FUNCTION app.integrator_upsert_reminder_rule(p_integrator_rule_id text, p_platform_user_id text, p_organization_id uuid, p_integrator_user_id bigint, p_category text, p_is_enabled boolean, p_schedule_type text, p_timezone text, p_interval_minutes integer, p_window_start_minute integer, p_window_end_minute integer, p_days_mask text, p_content_mode text, p_linked_object_type text, p_linked_object_id text, p_custom_title text, p_custom_text text, p_schedule_data text, p_reminder_intent text, p_quiet_hours_start_minute integer, p_quiet_hours_end_minute integer, p_notification_topic_code text, p_notification_topic_code_provided boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_platform_user_id uuid;
  v_updated_at text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_patient_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'integrator.reminder-rule.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($9))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($10))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($11))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($12))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($13))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($14))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($15))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($16))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($17))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($18))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($19))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($20))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($21))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($22))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($23))::app.port_typed_arg]), 'app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure);

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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.integrator_record_notification_delivery_attempt(p_organization_id uuid, p_user_id text, p_integrator_user_id text, p_topic_code text, p_intent_type text, p_channel text, p_status text, p_reason text, p_provider_status_code integer, p_event_id text, p_occurrence_id text, p_recipient_ref text, p_error_message text, p_metadata text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'integrator.notification-delivery-attempt.record', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($9))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($10))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($11))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($12))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($13))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($14))::app.port_typed_arg]), 'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)'::regprocedure);

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;

  v_user_id := p_user_id::uuid;

  -- rev10_tenant_insert_120, дословно.
  IF v_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = v_user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = v_user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    )
  THEN
    RAISE EXCEPTION 'integrator_notification_delivery_attempt_user_outside_organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_delivery_attempts (
    organization_id,
    user_id, integrator_user_id, topic_code, intent_type, channel, status, reason,
    provider_status_code, event_id, occurrence_id, recipient_ref, error_message, metadata
  ) VALUES (
    p_organization_id,
    v_user_id,
    p_integrator_user_id,
    p_topic_code,
    p_intent_type,
    p_channel,
    p_status,
    p_reason,
    p_provider_status_code,
    p_event_id,
    p_occurrence_id::uuid,
    p_recipient_ref,
    p_error_message,
    p_metadata::jsonb
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.integrator_increment_broadcast_audit_counter(p_broadcast_audit_id uuid, p_organization_id uuid, p_counter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'integrator.broadcast-audit-counter.increment', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.integrator_increment_broadcast_audit_counter(uuid,uuid,text)'::regprocedure);

  IF p_counter NOT IN ('sent_count', 'error_count', 'blocked_recipient_count') THEN
    RAISE EXCEPTION 'integrator_broadcast_audit_counter_unknown' USING ERRCODE = '23514';
  END IF;

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_broadcast_audit_counter_principal_required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_broadcast_audit_counter_principal_mismatch' USING ERRCODE = '42501';
  END IF;

  -- rev10_tenant_update_65, дословно: чужая рассылка не видна и не обновляется.
  UPDATE public.broadcast_audit AS audit
  SET sent_count = audit.sent_count + (CASE WHEN p_counter = 'sent_count' THEN 1 ELSE 0 END),
      error_count = audit.error_count + (CASE WHEN p_counter = 'error_count' THEN 1 ELSE 0 END),
      blocked_recipient_count = audit.blocked_recipient_count
        + (CASE WHEN p_counter = 'blocked_recipient_count' THEN 1 ELSE 0 END)
  WHERE audit.id = p_broadcast_audit_id
    AND audit.organization_id = p_organization_id;
  -- Ноль строк — не ошибка: ровно так же чужую рассылку сегодня отфильтровывает USING-половина
  -- политики, и вызывающий счётчик не проверяет.
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.integrator_set_user_channel_bot_blocked(p_organization_id uuid, p_user_id uuid, p_channel_code text, p_external_id text, p_bot_blocked boolean, p_bot_blocked_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_subject_in_organization boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'integrator.user-channel-bot-blocked.set', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg]), 'app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,boolean,text)'::regprocedure);

  -- Метка живёт только у мессенджеров: закрытый список, как и у вызывающего.
  IF p_channel_code IS NULL OR p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_user_channel_bot_blocked_channel_unknown' USING ERRCODE = '23514';
  END IF;

  IF p_bot_blocked IS NULL THEN
    RAISE EXCEPTION 'integrator_user_channel_bot_blocked_state_required' USING ERRCODE = '22023';
  END IF;

  IF p_user_id IS NULL AND p_external_id IS NULL THEN
    RAISE EXCEPTION 'integrator_user_channel_bot_blocked_subject_required' USING ERRCODE = '22023';
  END IF;

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_user_channel_bot_blocked_principal_required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_user_channel_bot_blocked_principal_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_bot_blocked AND p_user_id IS NOT NULL AND p_external_id IS NOT NULL THEN
    -- rev10_tenant_insert_216, WITH CHECK-половина: вставить привязку человека чужой клиники
    -- сегодня отказывает правом, а не тихо проходит.
    SELECT EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = p_user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = p_user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    ) INTO v_subject_in_organization;
    IF NOT v_subject_in_organization THEN
      RAISE EXCEPTION 'integrator_user_channel_bot_blocked_subject_outside_organization'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.user_channel_bindings (
      user_id, channel_code, external_id, bot_blocked_at, bot_blocked_reason
    ) VALUES (
      p_user_id, p_channel_code, p_external_id, pg_catalog.now(), p_bot_blocked_reason
    )
    ON CONFLICT (channel_code, external_id) DO UPDATE SET
      bot_blocked_at = pg_catalog.now(),
      bot_blocked_reason = p_bot_blocked_reason
    -- rev10_tenant_update_216, USING-половина: занятую чужой клиникой привязку сегодня не видно, и
    -- метка на неё не садится.
    WHERE EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = user_channel_bindings.user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = user_channel_bindings.user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    );
    RETURN;
  END IF;

  -- Остальные четыре формы — обновление уже существующей строки. Ключ поиска тот же, что у
  -- вызывающего: человек, если он известен, иначе внешний идентификатор канала.
  IF p_user_id IS NOT NULL THEN
    UPDATE public.user_channel_bindings AS binding
    SET bot_blocked_at = CASE WHEN p_bot_blocked THEN pg_catalog.now() ELSE NULL END,
        bot_blocked_reason = CASE WHEN p_bot_blocked THEN p_bot_blocked_reason ELSE NULL END
    WHERE binding.user_id = p_user_id
      AND binding.channel_code = p_channel_code
      AND (EXISTS (
        SELECT 1 FROM public.be_organization_members AS tenant_staff
        WHERE tenant_staff.platform_user_id = binding.user_id
          AND tenant_staff.organization_id = p_organization_id
          AND tenant_staff.status = 'active'
      ) OR EXISTS (
        SELECT 1 FROM public.org_enrollments AS tenant_patient
        WHERE tenant_patient.platform_user_id = binding.user_id
          AND tenant_patient.organization_id = p_organization_id
          AND tenant_patient.status = 'active'
      ));
    RETURN;
  END IF;

  UPDATE public.user_channel_bindings AS binding
  SET bot_blocked_at = CASE WHEN p_bot_blocked THEN pg_catalog.now() ELSE NULL END,
      bot_blocked_reason = CASE WHEN p_bot_blocked THEN p_bot_blocked_reason ELSE NULL END
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
    AND (EXISTS (
      SELECT 1 FROM public.be_organization_members AS tenant_staff
      WHERE tenant_staff.platform_user_id = binding.user_id
        AND tenant_staff.organization_id = p_organization_id
        AND tenant_staff.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.org_enrollments AS tenant_patient
      WHERE tenant_patient.platform_user_id = binding.user_id
        AND tenant_patient.organization_id = p_organization_id
        AND tenant_patient.status = 'active'
    ));
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.integrator_record_messenger_phone_bind_audit(p_organization_id uuid, p_target_id text, p_conflict_key text, p_details text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_details jsonb;
  v_existing_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'integrator.messenger-phone-bind-audit.record', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)'::regprocedure);

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'integrator_messenger_phone_bind_audit_principal_required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'integrator_messenger_phone_bind_audit_principal_mismatch' USING ERRCODE = '42501';
  END IF;

  v_details := p_details::jsonb;

  IF p_conflict_key IS NULL THEN
    -- Аномалия без ключа схлопывания: отдельная строка каждый раз, ровно как сегодня.
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, conflict_key, details, status
    ) VALUES (
      p_organization_id, NULL, 'messenger_phone_bind_anomaly', p_target_id, NULL, v_details, 'error'
    );
    RETURN true;
  END IF;

  -- `FOR UPDATE` держит открытую строку случая до конца двери: два вебхука на один и тот же
  -- конфликт не должны разойтись в «оба первые». PostgreSQL берёт за замок право класса UPDATE, а
  -- не SELECT, — оно у владельца шва объявлено.
  SELECT audit_row.id INTO v_existing_id
  FROM public.admin_audit_log AS audit_row
  WHERE audit_row.conflict_key = p_conflict_key
    AND audit_row.resolved_at IS NULL
    AND audit_row.organization_id = p_organization_id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.admin_audit_log AS audit_row
    SET details = audit_row.details || v_details,
        repeat_count = audit_row.repeat_count + 1,
        last_seen_at = pg_catalog.now(),
        status = 'error'
    WHERE audit_row.id = v_existing_id;
    RETURN false;
  END IF;

  BEGIN
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, conflict_key, details, status, repeat_count,
      last_seen_at
    ) VALUES (
      p_organization_id, NULL, 'messenger_phone_bind_blocked', p_target_id, p_conflict_key,
      v_details, 'error', 1, pg_catalog.now()
    );
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    -- Гонка: соседний вебхук успел вставить ту же открытую строку между нашим замком и вставкой.
    UPDATE public.admin_audit_log AS audit_row
    SET details = audit_row.details || v_details,
        repeat_count = audit_row.repeat_count + 1,
        last_seen_at = pg_catalog.now(),
        status = 'error'
    WHERE audit_row.conflict_key = p_conflict_key
      AND audit_row.resolved_at IS NULL
      AND audit_row.organization_id = p_organization_id;
    RETURN false;
  END;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.get_google_calendar_event_id(p_appointment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE v_event_id text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'calendar.map.get', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.get_google_calendar_event_id(uuid)'::regprocedure);

  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  SELECT m.gcal_event_id INTO v_event_id FROM public.booking_calendar_map m
   WHERE m.appointment_key = 'be:' || p_appointment_id::text;
  RETURN v_event_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.upsert_google_calendar_event_id(p_appointment_id uuid, p_event_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'calendar.map.upsert', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure);

  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR NOT EXISTS (
    SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization and event id required'; END IF;
  INSERT INTO public.booking_calendar_map(appointment_key, gcal_event_id)
  VALUES ('be:' || p_appointment_id::text, p_event_id)
  ON CONFLICT (appointment_key) DO UPDATE SET gcal_event_id = EXCLUDED.gcal_event_id, updated_at = now();
  UPDATE public.patient_bookings SET gcal_event_id = p_event_id, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.delete_google_calendar_event_id(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'calendar.map.delete', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.delete_google_calendar_event_id(uuid)'::regprocedure);

  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  DELETE FROM public.booking_calendar_map WHERE appointment_key = 'be:' || p_appointment_id::text;
  UPDATE public.patient_bookings SET gcal_event_id = NULL, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_booking_calendar_patient_profile(p_appointment_id uuid)
 RETURNS TABLE(is_problematic boolean, problematic_note text)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'calendar.patient-profile.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_booking_calendar_patient_profile(uuid)'::regprocedure);

  RETURN QUERY SELECT p.is_problematic, p.problematic_note
    FROM public.be_appointments a
    JOIN public.be_patient_booking_profiles p
      ON p.organization_id = a.organization_id AND p.platform_user_id = a.platform_user_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id();
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_booking_calendar_latest_staff_comment(p_appointment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE v_body text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_integrator_request'::name, 'tenant_service'::app.port_context_class, 'calendar.staff-comment.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure);

  SELECT c.body INTO v_body FROM public.be_appointments a
    JOIN public.be_appointment_staff_comments c
      ON c.appointment_id = a.id AND c.organization_id = a.organization_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
   ORDER BY c.created_at DESC LIMIT 1;
  RETURN v_body;
END
$function$;
