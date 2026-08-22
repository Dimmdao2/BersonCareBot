-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,boolean,text)') IS NOT NULL
--
-- D17 шаг 2b (1/3). `repos/userChannelBotBlocked.ts` ставил и снимал метку «бот заблокирован»
-- ПЯТЬЮ реляционными операторами по `public.user_channel_bindings` (один upsert и четыре UPDATE).
-- Живой маршрут один — `outgoingDeliveryWorker`, и арендаторская строка очереди обрабатывается
-- внутри `runWithOrganizationPrincipal(scope.organizationId, …)`, то есть под `app_tenant_service`:
-- это ЕДИНСТВЕННАЯ роль логина интегратора, которой декларация даёт INSERT/UPDATE на колонки
-- `bot_blocked_at`/`bot_blocked_reason` этой таблицы.
--
-- Дверь ОДНА, а не пять: снятие метки — та же запись с `p_bot_blocked = false`, а три формы поиска
-- строки (по человеку и внешнему идентификатору, по человеку, по внешнему идентификатору) — это
-- параметры одного действия, а не разные действия. Пять дверей к одной колонке были бы пятью
-- путями к одной записи.
--
-- Тело исполняется владельцем шва `app_seam_delivery_scope_owner` и обходит RLS, поэтому стена
-- арендатора повторена здесь ДОСЛОВНО по политикам `rev10_tenant_insert_216` и
-- `rev10_tenant_update_216`: человек строки обязан быть активным сотрудником или активно
-- зачисленным пациентом ИМЕННО этой организации. Разница между вставкой и обновлением сохранена
-- такой, какой её даёт RLS: WITH CHECK вставки ОТКАЗЫВАЕТ (42501), а USING обновления просто НЕ
-- ВИДИТ чужую строку — ноль строк и ни одной ошибки, ровно как сегодня. Гранты и политики остаются
-- исключительно за deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_set_user_channel_bot_blocked(
  p_organization_id uuid,
  p_user_id uuid,
  p_channel_code text,
  p_external_id text,
  p_bot_blocked boolean,
  p_bot_blocked_reason text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_subject_in_organization boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.user-channel-bot-blocked.set',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg
    ]),
    'app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,boolean,text)'::regprocedure
  );

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
