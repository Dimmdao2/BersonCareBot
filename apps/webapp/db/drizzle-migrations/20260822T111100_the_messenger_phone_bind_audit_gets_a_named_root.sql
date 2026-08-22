-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)') IS NOT NULL
--
-- D17 шаг 2b (2/3). `repos/messengerPhoneBindAudit.ts` вёл разбор конфликта привязки номера
-- ЧЕТЫРЬМЯ реляционными операторами по `public.admin_audit_log` внутри собственной `db.tx`:
-- `SELECT … FOR UPDATE` по открытой строке того же `conflict_key`, `UPDATE` счётчика повторов,
-- `INSERT` первой строки и `UPDATE` в ответ на гонку (23505). Живой маршрут один —
-- `writePort.ts`, ветка `phone-bind` не применилась, и он уже входит сюда через chokepoint
-- `writeDirectPublic('admin-audit-write', …)`, то есть под организационным принципалом
-- (`app_tenant_service`, класс `tenant_service`).
--
-- Дверь ОДНА на все четыре оператора, потому что это ОДНО действие — «зафиксировать случай и
-- сказать, первый ли он»: возвращаемое `true` и есть прежний `insertedFirst`, по которому
-- вызывающий решает, будить ли администратора. Разбить на «прочитать» и «записать» значило бы
-- вынести блокировку строки за пределы двери и потерять атомарность, ради которой и была `db.tx`.
--
-- Тело исполняется владельцем шва `app_seam_identity_lookup_owner` (у него уже объявлены
-- SELECT/INSERT/UPDATE на все нужные колонки) и обходит RLS. Таблица объявлена org=true, поэтому
-- стена организации повторена здесь ДОСЛОВНО: организация аргумента обязана совпасть с принятым
-- контекстом, и КАЖДЫЙ поиск строки дополнительно сужен `organization_id = p_organization_id`.
-- `idx_admin_audit_log_conflict_open` уникален по всей таблице, а не по клинике: без этого сужения
-- совпадение `conflict_key` у двух клиник дало бы дописывание в чужую строку. Гранты и политики
-- остаются исключительно за deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_record_messenger_phone_bind_audit(
  p_organization_id uuid,
  p_target_id text,
  p_conflict_key text,
  p_details text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_details jsonb;
  v_existing_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.messenger-phone-bind-audit.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg
    ]),
    'app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)'::regprocedure
  );

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
