-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0025
--
-- Пять тел SECURITY DEFINER жили ТОЛЬКО в живой DEV-базе: их не создавала ни одна пронумерованная
-- миграция и ни один скрипт `deploy/postgres/*.sql` (проверено 18.08:
-- `grep -rln <имя> --include=*.sql .` находит их лишь в сгенерированных артефактах
-- `deploy/postgres/generated/*`, то есть в ОПИСАНИИ прав, а не в определении функции).
-- Поэтому `deploy-test.sh` на `bersoncarebot_test` падал внутри reconcile-access:
--
--   ERROR: multi-capability exact gate token mismatch for
--          app.append_platform_audit_event(text,text,text): app_pre_session
--
-- Почему именно так: `generate.mjs` (режим `exact_existing`, строки ~1400-1412) НЕ переписывает
-- многокапабилитный гейт — он его только ПРОВЕРЯЕТ, требуя, чтобы РУКОПИСНЫЙ вызов
-- `app.require_accepted_context(...)` в живом теле содержал каждый токен из декларации. Тело,
-- существующее лишь в одной базе, в другую попасть не может ничем — ни миграцией, ни реконсайлом.
--
-- Что чинится (измерено 18.08 на обеих базах, только чтение):
--   * `app.append_platform_audit_event(text,text,text)` — есть в обеих базах, но на TEST тело
--     старое, однобранчевое: гейт называет только `app_platform_admin`/`platform`, а декларация
--     (`declaration.ts`, `execute: ['app_platform_admin', 'app_pre_session']`) требует ещё и
--     pre-session-ветку, без которой не пишется аудит-событие `auth_register_failure`;
--   * `app.require_attested_target_role(name,name[])`,
--     `app.enqueue_current_reminder_rule_push(text)`,
--     `app.read_current_patient_treatment_program_description(uuid)`,
--     `app.resolve_patient_acquiring_webhook_organization(text,text)` — на TEST ОТСУТСТВУЮТ
--     целиком, хотя все четыре объявлены в декларации и вызываются кодом приложения
--     (`integratorPushOutbox.ts`, `pgPatientOrganization.ts`, `pgPatientPayments.ts`).
--
-- Источник истины — DEV: тела скопированы дословно из `bcb_webapp_dev`
-- (`pg_get_functiondef`), поэтому на DEV миграция ничего не меняет, а TEST получает ровно то же
-- состояние. Обратное направление невозможно: TEST не содержит того, что требует декларация
-- репозитория, значит расходится именно TEST.
--
-- `BCB-MIGRATION-SCHEMA-CREATE: app` и `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` обязательны у
-- КАЖДОГО оператора: без них мигратор не выдаёт владельцу шва CREATE на схему `app`, и
-- `CREATE OR REPLACE` падает с «permission denied for schema app».
--
-- Гейты тел этим не подменяются: `exact`/`attested` reconcile-access перепишет сам, а рукописный
-- `exact_existing`-гейт в `app.append_platform_audit_event` приезжает сюда дословно и остаётся
-- единственной формой, которую генератор проверяет, но не создаёт.
--
-- Примитив контекста: возвращает шву reminder ТОЧНУЮ роль принятого контекста (patient или
-- staff). Владелец `app_seam_context_owner`, поэтому генератор гейтов его не трогает вовсе —
-- у примитивов контекста собственная, более строгая рукописная проверка. Без него
-- `app.enqueue_current_reminder_rule_push` на TEST не выполнится ни в одной ветке.
CREATE OR REPLACE FUNCTION app.require_attested_target_role(p_effective_role name, p_allowed_target_roles name[])
 RETURNS name
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
AS $function$
DECLARE
  v_database_id oid;
  v_target_role name;
BEGIN
  IF p_allowed_target_roles IS NULL
    OR cardinality(p_allowed_target_roles) = 0
    OR array_position(p_allowed_target_roles, NULL::name) IS NOT NULL
    OR NOT (
      (
        p_effective_role = 'app_seam_reminder_patient_owner'::name
        AND p_allowed_target_roles <@ ARRAY['app_patient'::name, 'app_staff'::name]::name[]
      )
      OR (
        p_effective_role = 'app_seam_telemetry_operator_owner'::name
        AND p_allowed_target_roles <@ ARRAY['app_platform_admin'::name, 'app_pre_session'::name]::name[]
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;

  SELECT oid INTO v_database_id
    FROM pg_database
   WHERE datname = current_database();

  SELECT accepted.target_role
    INTO v_target_role
    FROM app_ext.accepted_port_contexts AS accepted
    JOIN app_ext.port_context_capabilities AS capability
      ON capability.capability_id = accepted.capability_id
     AND capability.port = accepted.port
     AND capability.session_login = accepted.session_login
     AND capability.target_role = accepted.target_role
     AND capability.context_class = accepted.context_class
     AND capability.purpose = accepted.purpose
     AND capability.function_identity IS NOT DISTINCT FROM accepted.function_identity
     AND capability.active_from <= clock_timestamp()
     AND (capability.active_until IS NULL OR capability.active_until > clock_timestamp())
   WHERE accepted.database_oid = v_database_id
     AND accepted.backend_pid = pg_backend_pid()
     AND accepted.transaction_id = pg_current_xact_id()
     AND accepted.cleared_at IS NULL
     AND accepted.session_login = session_user
     AND accepted.target_role = ANY(p_allowed_target_roles);

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  RETURN v_target_role;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Ретрай push-уведомления по правилу напоминания: пациент — только своё правило, staff —
-- правило своей клиники. Гейт режима `attested`, его выражение reconcile-access перепишет сам;
-- здесь важно тело — выборка правила и запись в `public.integrator_push_outbox`.
CREATE OR REPLACE FUNCTION app.enqueue_current_reminder_rule_push(p_integrator_rule_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid;
  v_target_role name;
  v_payload jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
  v_target_role := app.require_attested_target_role(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );

  IF length(btrim(COALESCE(p_integrator_rule_id, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid reminder rule id' USING ERRCODE = '23514';
  END IF;

  IF v_target_role = 'app_patient'::name THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF v_target_role = 'app_staff'::name THEN
    PERFORM app.current_actor_user_id();
  ELSE
    RAISE EXCEPTION 'reminder fallback context denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', rule.integrator_rule_id,
    'integratorUserId', rule.integrator_user_id::text,
    'category', rule.category,
    'enabled', rule.is_enabled,
    'intervalMinutes', rule.interval_minutes,
    'windowStartMinute', rule.window_start_minute,
    'windowEndMinute', rule.window_end_minute,
    'daysMask', rule.days_mask,
    'timezone', rule.timezone,
    'fallbackEnabled', rule.category IN ('appointment', 'lfk', 'chat', 'important'),
    'linkedObjectType', rule.linked_object_type,
    'linkedObjectId', rule.linked_object_id,
    'customTitle', rule.custom_title,
    'customText', rule.custom_text,
    'scheduleType', rule.schedule_type,
    'scheduleData', rule.schedule_data,
    'reminderIntent', COALESCE(rule.reminder_intent, 'generic'),
    'displayTitle', rule.display_title,
    'displayDescription', rule.display_description,
    'quietHoursStartMinute', rule.quiet_hours_start_minute,
    'quietHoursEndMinute', rule.quiet_hours_end_minute,
    'notificationTopicCode', rule.notification_topic_code,
    'updatedAt', rule.updated_at
  )
    INTO v_payload
    FROM public.reminder_rules AS rule
   WHERE rule.integrator_rule_id = p_integrator_rule_id
     AND rule.organization_id = v_organization_id
     AND (v_target_role = 'app_staff'::name OR rule.platform_user_id = v_patient_user_id);

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'reminder rule unavailable in current context' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.integrator_push_outbox (
    kind, idempotency_key, payload, status, attempts_done, next_try_at, last_error, updated_at
  ) VALUES (
    'reminder_rule_upsert', 'reminder_rule:' || p_integrator_rule_id, v_payload,
    'pending', 0, now(), NULL, now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        status = 'pending',
        attempts_done = 0,
        next_try_at = now(),
        last_error = NULL,
        updated_at = now();

  RETURN true;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_program_resolver_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Описание шаблона программы отдаётся пациенту только для СВОЕГО экземпляра в СВОЕЙ активной
-- клинике: три INNER JOIN (instance → template → активный org_enrollment → активная организация)
-- и есть стена; вызывающий её обойти не может.
CREATE OR REPLACE FUNCTION app.read_current_patient_treatment_program_description(p_instance_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid := app.current_org_id();
  v_description text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_program_resolver_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.program.description.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_current_patient_treatment_program_description(uuid)'::regprocedure);

  IF v_patient_user_id IS NULL OR v_organization_id IS NULL OR p_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT template.description
    INTO v_description
    FROM public.treatment_program_instances AS instance
    INNER JOIN public.treatment_program_templates AS template
      ON template.id = instance.template_id
     AND template.organization_id = instance.organization_id
    INNER JOIN public.org_enrollments AS enrollment
      ON enrollment.organization_id = instance.organization_id
     AND enrollment.platform_user_id = v_patient_user_id
     AND enrollment.status = 'active'
    INNER JOIN public.be_organizations AS organization
      ON organization.id = instance.organization_id
     AND organization.is_active = true
   WHERE instance.id = p_instance_id
     AND instance.patient_user_id = v_patient_user_id
     AND instance.organization_id = v_organization_id
   LIMIT 1;

  RETURN NULLIF(btrim(v_description), '');
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Вебхук эквайринга приходит без сессии, поэтому организация определяется до принципала —
-- pre-session-корень. Неоднозначность (несколько платежей на один provider_payment_id)
-- возвращает NULL, а не первую попавшуюся клинику.
CREATE OR REPLACE FUNCTION app.resolve_patient_acquiring_webhook_organization(p_provider_id text, p_provider_payment_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'patient-payment.webhook.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.resolve_patient_acquiring_webhook_organization(text,text)'::regprocedure);

  IF p_provider_id IS NULL
     OR p_provider_payment_id IS NULL
     OR pg_catalog.btrim(p_provider_id) = ''
     OR pg_catalog.btrim(p_provider_payment_id) = '' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(payment.organization_id)
  INTO v_organization_ids
  FROM public.patient_payment AS payment
  WHERE payment.kind = 'acquiring'
    AND payment.provider = p_provider_id
    AND payment.provider_payment_id = p_provider_payment_id
    AND payment.status IN ('pending', 'paid', 'failed', 'refunded')
    AND payment.organization_id IS NOT NULL;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Тот самый рукописный `exact_existing`-гейт. Две ветки — не удобство, а требование
-- декларации: событие пишет и оператор платформы (`app_platform_admin`, actor известен), и
-- незалогиненный путь регистрации (`app_pre_session`, actor NULL). Одноветочная форма,
-- живущая сегодня на TEST, роняет reconcile на несовпадении токенов `app_pre_session`/
-- `pre_session` и не даёт записать `auth_register_failure`.
CREATE OR REPLACE FUNCTION app.append_platform_audit_event(p_action text, p_details text, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
AS $function$
DECLARE
  v_target_role name;
  v_actor_id uuid;
  inserted_id uuid;
  details_json jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
        THEN 'app_platform_admin'::name
      ELSE 'app_pre_session'::name
    END,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
        THEN 'platform'::app.port_context_class
      ELSE 'pre_session'::app.port_context_class
    END,
    'platform.audit-event.append',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_action))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_details))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_status))::app.port_typed_arg
    ]),
    'app.append_platform_audit_event(text,text,text)'::regprocedure
  );

  v_target_role := CASE
    WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER')
      THEN 'app_platform_admin'::name
    ELSE 'app_pre_session'::name
  END;

  IF v_target_role = 'app_platform_admin'::name THEN
    v_actor_id := app.current_actor_user_id();
  ELSIF v_target_role = 'app_pre_session'::name THEN
    v_actor_id := NULL;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;

  details_json := p_details::jsonb;
  IF p_action IS NULL
    OR p_action NOT IN (
      'operator_incidents_acknowledge_all',
      'operator_incidents_resolve_all',
      'health_failure_archive_clear_dead',
      'auth_register_failure'
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
    NULL, v_actor_id, p_action, details_json, p_status
  )
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$function$;
