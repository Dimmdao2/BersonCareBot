-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid,integer)') IS NOT NULL;
CREATE FUNCTION app.enqueue_integrator_outgoing_delivery(
  p_event_id text,
  p_kind text,
  p_channel text,
  p_payload_json_text text,
  p_max_attempts integer,
  p_next_retry_at timestamptz,
  p_organization_id uuid,
  p_done_retention_days integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public, pg_temp
AS $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_operational_delivery_worker'::name,
    'service'::app.port_context_class,
    'delivery.outgoing.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_event_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_kind))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_channel))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_payload_json_text))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_max_attempts))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_next_retry_at))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_done_retention_days))::app.port_typed_arg
    ]),
    'app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid,integer)'::regprocedure
  );
  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION 'integrator_outgoing_delivery_event_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('inbound_reply', 'operator_alert') THEN
    RAISE EXCEPTION 'integrator_outgoing_delivery_kind_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_channel NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_outgoing_delivery_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 20 THEN
    RAISE EXCEPTION 'integrator_outgoing_delivery_max_attempts_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_done_retention_days IS NULL OR p_done_retention_days < 1 OR p_done_retention_days > 365 THEN
    RAISE EXCEPTION 'integrator_outgoing_delivery_done_retention_days_invalid' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
    next_retry_at, organization_id
  ) VALUES (
    p_event_id, p_kind, p_channel, p_payload_json_text::jsonb, 'pending', 0,
    p_max_attempts, COALESCE(p_next_retry_at, now()), p_organization_id
  ) ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  DELETE FROM public.outgoing_delivery_queue
  WHERE status = 'sent'
    AND sent_at IS NOT NULL
    AND NOT (
      kind = 'specialist_task_reminder'
      AND payload_json ? 'successOutcome'
      AND payload_json #>> '{successOutcome,appliedAt}' IS NULL
    )
    AND NOT (
      kind = 'specialist_task_reminder'
      AND payload_json #>> '{bookkeeping,botMarkerRequired}' = 'true'
      AND payload_json #>> '{bookkeeping,botMarkerAppliedAt}' IS NULL
    )
    AND sent_at < now() - ((p_done_retention_days::text || ' days')::interval);

  RETURN v_inserted_count = 1;
END
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
DROP FUNCTION IF EXISTS app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid);
