-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0410
-- One exact retry-enqueue seam for accepted Telegram/MAX replies. The tenant webhook principal
-- cannot and must not receive direct access to the system delivery queue.
CREATE FUNCTION app.enqueue_integrator_inbound_reply(
  p_event_id text,
  p_channel text,
  p_payload_json_text text,
  p_max_attempts integer,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_operational_delivery_worker', 'service',
    'delivery.inbound-reply.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_event_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_channel))::app.port_typed_arg,
      ROW('text@1', textsend(p_payload_json_text))::app.port_typed_arg,
      ROW('integer@1', int4send(p_max_attempts))::app.port_typed_arg,
      ROW('uuid@1', CASE WHEN p_organization_id IS NULL THEN NULL ELSE uuid_send(p_organization_id) END)::app.port_typed_arg
    ]),
    'app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)'::regprocedure
  );

  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION 'inbound_reply_event_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_channel NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'inbound_reply_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 20 THEN
    RAISE EXCEPTION 'inbound_reply_max_attempts_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outgoing_delivery_queue (
    event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
    next_retry_at, organization_id
  ) VALUES (
    p_event_id, 'inbound_reply', p_channel, p_payload_json_text::jsonb, 'pending', 0,
    p_max_attempts, now(), p_organization_id
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count = 1;
END
$function$;
