-- BCB-MIGRATION-OWNER: app_seam_telemetry_exclusion_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0411
-- Platform operations may inspect the registration-funnel journal, but the raw relation and its
-- user_id remain unavailable. This root applies the fixed event wall and returns no user identity.
CREATE FUNCTION app.list_platform_registration_analytics_events(
  p_start_at timestamp with time zone,
  p_end_exclusive timestamp with time zone,
  p_event_type text,
  p_error_class text,
  p_auth_method text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE(
  id uuid,
  occurred_at timestamp with time zone,
  event_type text,
  entry_channel text,
  metadata jsonb,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_exclusion_owner', 'app_platform_settings', 'platform',
    'analytics.registration-events.read',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamp with time zone@1', timestamptz_send(p_start_at))::app.port_typed_arg,
      ROW('timestamp with time zone@1', timestamptz_send(p_end_exclusive))::app.port_typed_arg,
      ROW('text@1', CASE WHEN p_event_type IS NULL THEN NULL ELSE textsend(p_event_type) END)::app.port_typed_arg,
      ROW('text@1', CASE WHEN p_error_class IS NULL THEN NULL ELSE textsend(p_error_class) END)::app.port_typed_arg,
      ROW('text@1', CASE WHEN p_auth_method IS NULL THEN NULL ELSE textsend(p_auth_method) END)::app.port_typed_arg,
      ROW('integer@1', int4send(p_limit))::app.port_typed_arg,
      ROW('integer@1', int4send(p_offset))::app.port_typed_arg
    ]),
    'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)'::regprocedure
  );

  IF p_start_at IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start_at THEN
    RAISE EXCEPTION 'registration_events_range_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NOT NULL AND p_event_type NOT IN (
    'auth_register_attempt', 'auth_register_success', 'auth_register_failure'
  ) THEN
    RAISE EXCEPTION 'registration_events_type_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_error_class IS NOT NULL AND p_error_class NOT IN ('user', 'system') THEN
    RAISE EXCEPTION 'registration_events_error_class_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_auth_method IS NOT NULL AND (btrim(p_auth_method) = '' OR length(p_auth_method) > 64) THEN
    RAISE EXCEPTION 'registration_events_auth_method_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN
    RAISE EXCEPTION 'registration_events_page_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    event.occurred_at,
    event.event_type,
    event.entry_channel,
    COALESCE(event.metadata, '{}'::jsonb),
    count(*) OVER () AS total_count
  FROM public.product_analytics_events_recent AS event
  WHERE event.occurred_at >= p_start_at
    AND event.occurred_at < p_end_exclusive
    AND event.event_type IN (
      'auth_register_attempt', 'auth_register_success', 'auth_register_failure'
    )
    AND NOT app.is_platform_registration_analytics_user_excluded(event.user_id)
    AND (p_event_type IS NULL OR event.event_type = p_event_type)
    AND (p_error_class IS NULL OR event.metadata->>'errorClass' = p_error_class)
    AND (p_auth_method IS NULL OR event.metadata->>'authMethod' = p_auth_method)
  ORDER BY event.occurred_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END
$function$;
