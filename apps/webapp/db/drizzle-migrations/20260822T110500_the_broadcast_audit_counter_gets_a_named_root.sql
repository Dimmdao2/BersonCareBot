-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_increment_broadcast_audit_counter(uuid,uuid,text)') IS NOT NULL
--
-- D17 шаг 1 (6/6). `outgoingDeliveryWorker` трижды инкрементировал счётчики `public.broadcast_audit`
-- (`sent_count`, `error_count`, `blocked_recipient_count`) реляционным UPDATE под
-- `app_tenant_service`. Три места — одна операция с параметром-именем счётчика, поэтому корень один,
-- а не три (принцип одного узкого места).
--
-- Тело исполняется владельцем шва `app_seam_delivery_scope_owner` (у него уже есть
-- SELECT ("id","organization_id") на этой таблице) и обходит RLS, поэтому стена арендатора повторена
-- здесь ДОСЛОВНО по политике `rev10_tenant_update_65`: организация обязана совпасть с принятым
-- контекстом И с организацией самой строки рассылки. Гранты и политики остаются исключительно за
-- deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_increment_broadcast_audit_counter(
  p_broadcast_audit_id uuid,
  p_organization_id uuid,
  p_counter text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.broadcast-audit-counter.increment',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg
    ]),
    'app.integrator_increment_broadcast_audit_counter(uuid,uuid,text)'::regprocedure
  );

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
