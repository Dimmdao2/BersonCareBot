-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Read-only exact root used around the integrator-owned canonical phone-link transaction.

CREATE OR REPLACE FUNCTION app.phone_messenger_bind_completion_state(
  p_token_hash text,
  p_channel_code text,
  p_external_id text,
  p_contact_phone text
)
RETURNS TABLE (
  ready boolean,
  account_created boolean,
  sync_target_user_id uuid,
  canonical_user_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_secret public.phone_messenger_bind_secrets%ROWTYPE;
  v_binding_user_id uuid;
  v_binding_canonical_id uuid;
  v_target_canonical_id uuid;
  v_binding_phone text;
  v_binding_created_at timestamptz;
  v_next_id uuid;
  v_depth integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_binding_owner', 'app_pre_session', 'pre_session',
    'auth.phone-messenger-bind.completion-state',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg,
      ROW('text@1', textsend(p_channel_code))::app.port_typed_arg,
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_contact_phone))::app.port_typed_arg
    ]),
    'app.phone_messenger_bind_completion_state(text,text,text,text)'::regprocedure
  );

  IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
     OR p_channel_code NOT IN ('telegram', 'max')
     OR p_external_id IS NULL OR btrim(p_external_id) = ''
     OR p_contact_phone IS NULL OR btrim(p_contact_phone) = '' THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT secret.* INTO v_secret
    FROM public.phone_messenger_bind_secrets AS secret
   WHERE secret.token_hash = p_token_hash;
  IF NOT FOUND
     OR v_secret.channel_code <> p_channel_code
     OR v_secret.phone_normalized <> p_contact_phone THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT binding.user_id INTO v_binding_user_id
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id;

  v_binding_canonical_id := v_binding_user_id;
  v_depth := 0;
  WHILE v_binding_canonical_id IS NOT NULL AND v_depth < 32 LOOP
    SELECT person.merged_into_id, person.phone_normalized, person.created_at
      INTO v_next_id, v_binding_phone, v_binding_created_at
      FROM public.platform_users AS person
     WHERE person.id = v_binding_canonical_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL;
    v_binding_canonical_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  v_target_canonical_id := v_secret.user_id;
  v_depth := 0;
  WHILE v_target_canonical_id IS NOT NULL AND v_depth < 32 LOOP
    SELECT person.merged_into_id INTO v_next_id
      FROM public.platform_users AS person
     WHERE person.id = v_target_canonical_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL;
    v_target_canonical_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN QUERY SELECT
    v_binding_canonical_id IS NOT NULL
      AND v_binding_phone = v_secret.phone_normalized
      AND (v_secret.purpose <> 'profile_bind'
        OR v_target_canonical_id = v_binding_canonical_id),
    v_secret.purpose = 'login'
      AND v_binding_created_at IS NOT NULL
      AND v_binding_created_at >= v_secret.created_at,
    CASE WHEN v_secret.purpose = 'profile_bind' THEN v_target_canonical_id ELSE NULL::uuid END,
    v_binding_canonical_id;
END
$function$;
