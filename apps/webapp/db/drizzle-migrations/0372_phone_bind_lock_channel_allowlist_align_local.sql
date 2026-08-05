-- TEMPORARY LOCAL MIGRATION NUMBER 0372
--
-- Align auth_phone_bind_lock_channel_binding channel allowlist with
-- auth_phone_bind_upsert_channel_binding (telegram/max/vk only). 'web' is not a
-- messenger binding key in createOrBind (channelToBindingKey returns null).

CREATE OR REPLACE FUNCTION app.auth_phone_bind_lock_channel_binding(
  p_channel_code text,
  p_external_id text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_channel_code IS NULL
     OR btrim(p_channel_code) = ''
     OR p_external_id IS NULL
     OR btrim(p_external_id) = ''
     OR p_channel_code NOT IN ('telegram', 'max', 'vk')
  THEN
    RETURN NULL;
  END IF;

  SELECT binding.user_id
  INTO v_user_id
  FROM public.user_channel_bindings AS binding
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
  FOR UPDATE;

  RETURN v_user_id;
END
$function$;
--> statement-breakpoint

DO $phone_bind_lock_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) OWNER TO app_owner;
  END IF;
END
$phone_bind_lock_owner$;
--> statement-breakpoint

COMMENT ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) IS
  'Bootstrap phone bind: lock an exact channel/external-id binding row, if any; channels telegram/max/vk only.';
