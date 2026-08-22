-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_append_reminder_delivery_event(uuid,text,text,text,bigint,text,text,text,text,timestamp with time zone)') IS NOT NULL
--
-- D17 шаг 1 (2/6). `appendReminderDeliveryEventDirect` писал `public.reminder_delivery_events`
-- реляционно. Единственная роль логина интегратора с этим грантом —
-- `app_operational_delivery_worker`, и её политика `rev10_delivery_replay_worker_170` пускает
-- запись ТОЛЬКО когда в `integrator.direct_public_write_retries` есть взятая в работу строка
-- повтора, называющая ту же организацию и тот же `integrator_delivery_log_id`. Живой путь именно
-- такой: первая попытка из воркера доставки идёт под организацией (`app_tenant_service`, гранта
-- нет), отказ ставит долговечный повтор, и запись приземляет `directPublicWriteRetryWorker`.
--
-- Тело исполняется владельцем шва и обходит RLS, поэтому та же стена повторена здесь ДОСЛОВНО:
-- корень отказывает, пока взятой строки повтора нет. Гранты и политики остаются исключительно за
-- deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_append_reminder_delivery_event(
  p_organization_id uuid,
  p_integrator_delivery_log_id text,
  p_integrator_occurrence_id text,
  p_integrator_rule_id text,
  p_integrator_user_id bigint,
  p_channel text,
  p_status text,
  p_error_code text,
  p_payload_json text,
  p_created_at timestamp with time zone
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
    'app_operational_delivery_worker'::name,
    'service'::app.port_context_class,
    'integrator.reminder-delivery-event.append',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg
    ]),
    'app.integrator_append_reminder_delivery_event(uuid,text,text,text,bigint,text,text,text,text,timestamp with time zone)'::regprocedure
  );

  -- rev10_delivery_replay_worker_170, дословно.
  IF NOT EXISTS (
    SELECT 1
    FROM integrator.direct_public_write_retries AS claimed_retry
    WHERE claimed_retry.status = 'processing'
      AND claimed_retry.operation = 'reminder_delivery_log_append'
      AND claimed_retry.organization_id = p_organization_id
      AND claimed_retry.payload ->> 'organizationId' = p_organization_id::text
      AND claimed_retry.payload ->> 'integratorDeliveryLogId' = p_integrator_delivery_log_id
  ) THEN
    RAISE EXCEPTION 'integrator_reminder_delivery_event_append_without_claimed_retry'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.reminder_delivery_events (
    organization_id, integrator_delivery_log_id, integrator_occurrence_id, integrator_rule_id,
    integrator_user_id, channel, status, error_code, payload_json, created_at
  ) VALUES (
    p_organization_id, p_integrator_delivery_log_id, p_integrator_occurrence_id,
    p_integrator_rule_id, p_integrator_user_id, p_channel, p_status,
    p_error_code, p_payload_json::jsonb, p_created_at
  )
  ON CONFLICT (integrator_delivery_log_id) DO NOTHING;
END
$function$;
