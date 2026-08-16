-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_integrator_support_delivery_attempt(
  p_organization_id uuid,
  p_integrator_intent_event_id text,
  p_correlation_id text,
  p_channel_code text,
  p_status text,
  p_attempt integer,
  p_reason text,
  p_payload_json text,
  p_occurred_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_id uuid;
  v_created boolean := false;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_delivery_scope_owner'::name,
    ARRAY['app_tenant_service'::name]::name[]
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'organization_context_required');
  END IF;

  INSERT INTO public.support_delivery_events (
    id,
    organization_id,
    conversation_message_id,
    integrator_intent_event_id,
    correlation_id,
    channel_code,
    status,
    attempt,
    reason,
    payload_json,
    occurred_at
  )
  VALUES (
    gen_random_uuid(),
    v_org,
    NULL,
    p_integrator_intent_event_id,
    p_correlation_id,
    p_channel_code,
    p_status,
    p_attempt,
    p_reason,
    COALESCE(p_payload_json::jsonb, '{}'::jsonb),
    p_occurred_at
  )
  ON CONFLICT (integrator_intent_event_id)
    WHERE integrator_intent_event_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    v_created := true;
  ELSIF p_integrator_intent_event_id IS NOT NULL THEN
    SELECT event.id
    INTO v_id
    FROM public.support_delivery_events AS event
    WHERE event.integrator_intent_event_id = p_integrator_intent_event_id
      AND event.organization_id = v_org
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'support_delivery_attempt_conflict');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'created', v_created);
END
$function$;
