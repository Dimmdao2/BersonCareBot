-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'phone_messenger_bind_secrets' AND column_name = 'claimed_external_id')
ALTER TABLE public.phone_messenger_bind_secrets
  ADD COLUMN IF NOT EXISTS claimed_external_id text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_phone_messenger_bind_secrets_live_claim')
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_messenger_bind_secrets_live_claim
  ON public.phone_messenger_bind_secrets (channel_code, claimed_external_id)
  WHERE status = 'pending_contact' AND claimed_external_id IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.phone_messenger_bind_claim(text,text,text)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.phone_messenger_bind_claim(p_token_hash text, p_channel_code text, p_external_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret public.phone_messenger_bind_secrets%ROWTYPE;
  v_newer_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-messenger-bind.claim', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.phone_messenger_bind_claim(text,text,text)'::regprocedure);

  IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
     OR p_channel_code NOT IN ('telegram', 'max')
     OR p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RETURN 'invalid_claim';
  END IF;

  SELECT secret.* INTO v_secret
    FROM public.phone_messenger_bind_secrets AS secret
   WHERE secret.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_or_expired'; END IF;
  IF v_secret.status = 'consumed' OR v_secret.consumed_at IS NOT NULL THEN RETURN 'used_token'; END IF;
  IF v_secret.expires_at <= clock_timestamp() THEN
    UPDATE public.phone_messenger_bind_secrets SET status = 'expired', failure_code = 'expired'
     WHERE id = v_secret.id AND status <> 'consumed';
    RETURN 'expired';
  END IF;
  IF v_secret.channel_code <> p_channel_code THEN RETURN 'channel_mismatch'; END IF;
  IF v_secret.status <> 'pending_contact' THEN RETURN 'not_live'; END IF;
  IF v_secret.claimed_external_id IS NOT NULL AND v_secret.claimed_external_id <> p_external_id THEN
    RETURN 'claimed_by_other_external_id';
  END IF;

  SELECT newer.id INTO v_newer_id
    FROM public.phone_messenger_bind_secrets AS newer
   WHERE newer.channel_code = p_channel_code
     AND newer.claimed_external_id = p_external_id
     AND newer.status = 'pending_contact'
     AND newer.expires_at > clock_timestamp()
     AND newer.id <> v_secret.id
     AND newer.created_at > v_secret.created_at
   ORDER BY newer.created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF v_newer_id IS NOT NULL THEN
    UPDATE public.phone_messenger_bind_secrets SET status = 'failed', failure_code = 'superseded_by_newer_start'
     WHERE id = v_secret.id AND status = 'pending_contact';
    RETURN 'superseded_by_newer_start';
  END IF;

  UPDATE public.phone_messenger_bind_secrets
     SET status = 'failed', failure_code = 'superseded_by_newer_start'
   WHERE channel_code = p_channel_code
     AND claimed_external_id = p_external_id
     AND status = 'pending_contact'
     AND id <> v_secret.id;

  UPDATE public.phone_messenger_bind_secrets
     SET claimed_external_id = p_external_id, claimed_at = COALESCE(claimed_at, clock_timestamp()), failure_code = NULL
   WHERE id = v_secret.id AND status = 'pending_contact';
  RETURN 'claimed';
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.phone_messenger_bind_claimed_secret(text,text,text)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.phone_messenger_bind_claimed_secret(p_token_hash text, p_channel_code text, p_external_id text)
 RETURNS TABLE(token_hash text, id uuid, phone_normalized text, channel_code text, purpose text, user_id uuid, status text, challenge_id text, failure_code text, claimed_external_id text, claimed_at timestamp with time zone, expires_at timestamp with time zone, consumed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
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
  LIMIT 1
$function$;
