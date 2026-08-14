-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Exact bootstrap root for the first Telegram/MAX webhook. The resolver role receives only the
-- returned canonical UUID; it never receives relation privileges on the identity tables.

CREATE OR REPLACE FUNCTION app.integrator_upsert_channel_identity(
  p_channel_code text,
  p_external_id text,
  p_display_handle text
)
RETURNS TABLE (
  platform_user_id uuid,
  account_created boolean,
  channel_binding_inserted boolean
)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_platform_user_id uuid;
  v_display_handle text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner', 'app_integrator_resolver', 'integrator',
    'integrator.channel-identity.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_channel_code))::app.port_typed_arg,
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_display_handle))::app.port_typed_arg
    ]),
    'app.integrator_upsert_channel_identity(text,text,text)'::regprocedure
  );

  IF p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_channel_identity_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION 'integrator_channel_identity_external_id_required' USING ERRCODE = '22023';
  END IF;

  v_display_handle := nullif(
    left(regexp_replace(btrim(coalesce(p_display_handle, '')), '^@+', ''), 32),
    ''
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('integrator-channel-identity:' || p_channel_code || ':' || p_external_id, 0)
  );

  SELECT person.id
    INTO v_platform_user_id
    FROM public.user_channel_bindings AS binding
    INNER JOIN public.platform_users AS person ON person.id = binding.user_id
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id
     AND person.merged_into_id IS NULL;

  IF v_platform_user_id IS NOT NULL THEN
    IF v_display_handle IS NOT NULL THEN
      UPDATE public.user_channel_bindings
         SET display_handle = v_display_handle
       WHERE user_id = v_platform_user_id
         AND channel_code = p_channel_code
         AND external_id = p_external_id
         AND display_handle IS DISTINCT FROM v_display_handle;
    END IF;
    RETURN QUERY SELECT v_platform_user_id, false, false;
    RETURN;
  END IF;

  INSERT INTO public.platform_users (display_name)
  VALUES ('')
  RETURNING id INTO v_platform_user_id;

  INSERT INTO public.user_identity (platform_user_id, display_name, updated_at)
  VALUES (v_platform_user_id, '', now());

  INSERT INTO public.user_channel_bindings (
    user_id, channel_code, external_id, display_handle
  ) VALUES (
    v_platform_user_id, p_channel_code, p_external_id, v_display_handle
  );

  INSERT INTO public.user_channel_preferences AS preferences (
    user_id, platform_user_id, channel_code,
    is_enabled_for_messages, is_enabled_for_notifications, updated_at
  ) VALUES (
    v_platform_user_id::text, v_platform_user_id, p_channel_code, true, true, now()
  )
  ON CONFLICT (user_id, channel_code) DO UPDATE SET
    platform_user_id = COALESCE(preferences.platform_user_id, EXCLUDED.platform_user_id),
    is_enabled_for_messages = true,
    is_enabled_for_notifications = true,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_platform_user_id, true, true;
END
$function$;
