-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef('app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure) LIKE '%app_operational_delivery_worker%'
-- The same occurrence root serves the tenant foreground path and the durable delivery replay path.
-- Grants remain exclusively in deploy/postgres/privileges reconciliation.

CREATE OR REPLACE FUNCTION app.record_reminder_occurrence_finalized_projection(
  p_integrator_occurrence_id text,
  p_integrator_rule_id text,
  p_integrator_user_id bigint,
  p_platform_user_id uuid,
  p_organization_id uuid,
  p_category text,
  p_status text,
  p_delivery_channel text,
  p_error_code text,
  p_occurred_at timestamp with time zone
)
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
