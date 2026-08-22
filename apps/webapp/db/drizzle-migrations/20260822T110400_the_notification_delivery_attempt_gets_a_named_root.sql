-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)') IS NOT NULL
--
-- D17 шаг 1 (5/6). `recordNotificationDeliveryAttemptBestEffort` писал
-- `public.notification_delivery_attempts` реляционно под `app_tenant_service` — единственной ролью
-- логина интегратора, у которой на этой таблице есть INSERT. Тот же результат теперь даёт один
-- именованный корень.
--
-- Тело исполняется владельцем шва `app_seam_delivery_scope_owner` и обходит RLS, поэтому стена
-- арендатора повторена здесь ДОСЛОВНО по политике `rev10_tenant_insert_120`: организация обязана
-- совпасть с принятым контекстом, а названный платформенный пользователь — быть активным
-- сотрудником либо активно записанным пациентом ЭТОЙ организации. Гранты и политики остаются
-- исключительно за deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_record_notification_delivery_attempt(
  p_organization_id uuid,
  p_user_id text,
  p_integrator_user_id text,
  p_topic_code text,
  p_intent_type text,
  p_channel text,
  p_status text,
  p_reason text,
  p_provider_status_code integer,
  p_event_id text,
  p_occurrence_id text,
  p_recipient_ref text,
  p_error_message text,
  p_metadata text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.notification-delivery-attempt.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($9))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($10))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($11))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($12))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($13))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($14))::app.port_typed_arg
    ]),
    'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)'::regprocedure
  );

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
