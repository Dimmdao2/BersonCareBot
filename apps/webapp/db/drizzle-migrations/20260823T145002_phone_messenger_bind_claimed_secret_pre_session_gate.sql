-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.phone_messenger_bind_claimed_secret(text,text,text)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.phone_messenger_bind_claimed_secret(p_token_hash text, p_channel_code text, p_external_id text)
 RETURNS TABLE(token_hash text, id uuid, phone_normalized text, channel_code text, purpose text, user_id uuid, status text, challenge_id text, failure_code text, claimed_external_id text, claimed_at timestamp with time zone, expires_at timestamp with time zone, consumed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-messenger-bind.claimed-secret.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.phone_messenger_bind_claimed_secret(text,text,text)'::regprocedure);

  RETURN QUERY
  SELECT secret.token_hash, secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
    secret.user_id, secret.status, secret.challenge_id, secret.failure_code, secret.claimed_external_id,
    secret.claimed_at, secret.expires_at, secret.consumed_at
  FROM public.phone_messenger_bind_secrets AS secret
  WHERE secret.channel_code = p_channel_code
    AND secret.claimed_external_id = p_external_id
    AND secret.claimed_at IS NOT NULL
    AND secret.status = 'pending_contact'
    AND secret.expires_at > statement_timestamp()
    AND (p_token_hash IS NULL OR secret.token_hash = p_token_hash)
  ORDER BY secret.created_at DESC
  LIMIT 1;
END
$function$;
