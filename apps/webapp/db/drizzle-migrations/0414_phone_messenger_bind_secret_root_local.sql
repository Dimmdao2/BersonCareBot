-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Exact pre-session lifecycle root for bearer secrets; runtime roles retain no relation ACL.

CREATE OR REPLACE FUNCTION app.phone_messenger_bind_secret(
  p_action text,
  p_token_hash text,
  p_secret_id uuid,
  p_phone_normalized text,
  p_channel_code text,
  p_purpose text,
  p_user_id uuid,
  p_challenge_id text,
  p_failure_code text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  id uuid,
  phone_normalized text,
  channel_code text,
  purpose text,
  user_id uuid,
  status text,
  challenge_id text,
  failure_code text,
  expires_at timestamptz,
  consumed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_binding_owner', 'app_pre_session', 'pre_session',
    'auth.phone-messenger-bind.secret',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_action))::app.port_typed_arg,
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_secret_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_phone_normalized))::app.port_typed_arg,
      ROW('text@1', textsend(p_channel_code))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_failure_code))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]),
    'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)'::regprocedure
  );

  IF p_action = 'start' THEN
    IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
       OR p_phone_normalized IS NULL OR btrim(p_phone_normalized) = ''
       OR p_channel_code NOT IN ('telegram', 'max')
       OR p_purpose NOT IN ('login', 'profile_bind')
       OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
       OR (p_purpose = 'login' AND p_user_id IS NOT NULL)
       OR (p_purpose = 'profile_bind' AND p_user_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_start';
    END IF;
    DELETE FROM public.phone_messenger_bind_secrets AS secret
     WHERE secret.phone_normalized = p_phone_normalized
       AND secret.channel_code = p_channel_code
       AND secret.purpose = p_purpose
       AND secret.status = 'pending_contact';
    RETURN QUERY
    INSERT INTO public.phone_messenger_bind_secrets AS secret
      (token_hash, phone_normalized, channel_code, purpose, user_id, status, expires_at)
    VALUES
      (p_token_hash, p_phone_normalized, p_channel_code, p_purpose, p_user_id,
       'pending_contact', p_expires_at)
    RETURNING secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
      secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
      secret.expires_at, secret.consumed_at;
    RETURN;
  ELSIF p_action = 'find' THEN
    IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN RETURN; END IF;
    RETURN QUERY
    SELECT secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
      secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
      secret.expires_at, secret.consumed_at
      FROM public.phone_messenger_bind_secrets AS secret
     WHERE secret.token_hash = p_token_hash;
    RETURN;
  ELSIF p_action = 'expire' THEN
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'expired'
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'fail' THEN
    IF p_failure_code IS NULL OR btrim(p_failure_code) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_failure';
    END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'failed', failure_code = p_failure_code
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'otp_ready' THEN
    IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_challenge';
    END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'otp_ready', challenge_id = p_challenge_id, failure_code = NULL
     WHERE secret.id = p_secret_id AND secret.status = 'pending_contact';
  ELSIF p_action = 'consume' THEN
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'consumed', consumed_at = COALESCE(secret.consumed_at, clock_timestamp())
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'consume_challenge' THEN
    IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN; END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'consumed', consumed_at = clock_timestamp()
     WHERE secret.challenge_id = p_challenge_id AND secret.status = 'otp_ready';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_action';
  END IF;

  RETURN QUERY
  SELECT secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
    secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
    secret.expires_at, secret.consumed_at
    FROM public.phone_messenger_bind_secrets AS secret
   WHERE secret.id = p_secret_id
      OR (p_action = 'consume_challenge' AND secret.challenge_id = p_challenge_id);
END
$function$;
