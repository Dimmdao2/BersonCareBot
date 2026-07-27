-- 0258: restore bootstrap auth actions without granting the NOINHERIT base login direct table access.
--
-- Every caller below enters through a route that stamps the bootstrap principal, so PostgreSQL keeps
-- executing as the bare nonstaff login. app_owner bypasses RLS; each function therefore repeats the
-- exact row/action predicate and exposes rows only behind an exact UUID or a server-generated opaque hash.

DO $bootstrap_auth_accessor_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_pins TO app_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channel_link_secrets TO app_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_email_setup_tokens TO app_owner;
    GRANT SELECT, INSERT ON TABLE public.user_oauth_bindings TO app_owner;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.login_tokens TO app_owner;
  END IF;
END
$bootstrap_auth_accessor_owner_grants$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_read(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  pin_hash text,
  attempts_failed integer,
  locked_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- Exact UUID only: never scans or returns another user's PIN row.
  SELECT pin.user_id, pin.pin_hash, pin.attempts_failed::integer, pin.locked_until
  FROM public.user_pins AS pin
  WHERE p_user_id IS NOT NULL
    AND pin.user_id = p_user_id
$function$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_upsert(
  p_user_id uuid,
  p_pin_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_pin_hash IS NULL OR btrim(p_pin_hash) = '' THEN
    RETURN false;
  END IF;

  -- Session code supplies one exact user id; this action can only replace that row and reset its lock.
  INSERT INTO public.user_pins AS pin (
    user_id,
    pin_hash,
    attempts_failed,
    locked_until,
    updated_at
  )
  VALUES (p_user_id, p_pin_hash, 0, NULL, statement_timestamp())
  ON CONFLICT (user_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      attempts_failed = 0,
      locked_until = NULL,
      updated_at = statement_timestamp()
  WHERE pin.user_id = p_user_id;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_increment_failed(p_user_id uuid)
RETURNS TABLE (
  attempts_failed integer,
  locked_until timestamptz
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- Fixed policy prevents a caller from choosing an arbitrary counter threshold or lock duration.
  UPDATE public.user_pins AS pin
  SET attempts_failed = pin.attempts_failed + 1,
      updated_at = statement_timestamp(),
      locked_until = CASE
        WHEN pin.attempts_failed + 1 >= 5
          THEN statement_timestamp() + make_interval(mins => 15)
        ELSE pin.locked_until
      END
  WHERE p_user_id IS NOT NULL
    AND pin.user_id = p_user_id
  RETURNING pin.attempts_failed::integer, pin.locked_until
$function$;

CREATE OR REPLACE FUNCTION app.auth_user_pin_reset_attempts(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Successful verification or elapsed lockout resets only the exact supplied user row.
  UPDATE public.user_pins AS pin
  SET attempts_failed = 0,
      locked_until = NULL,
      updated_at = statement_timestamp()
  WHERE p_user_id IS NOT NULL
    AND pin.user_id = p_user_id;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_replace_secret(
  p_user_id uuid,
  p_channel_code text,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_user_id IS NULL
     OR p_channel_code NOT IN ('telegram', 'max')
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'invalid_channel_link_secret';
  END IF;

  -- Authenticated session ownership is narrowed to one user/channel pair and one fresh opaque hash.
  DELETE FROM public.channel_link_secrets AS secret
  WHERE secret.user_id = p_user_id
    AND secret.channel_code = p_channel_code;

  INSERT INTO public.channel_link_secrets (user_id, channel_code, token_hash, expires_at)
  VALUES (p_user_id, p_channel_code, p_token_hash, p_expires_at);
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_read_secret(
  p_channel_code text,
  p_token_hash text
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  expires_at timestamptz,
  used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- The 256-bit peppered token hash is the bearer capability; no phone/user scan is available.
  SELECT secret.id, secret.user_id, secret.expires_at, secret.used_at
  FROM public.channel_link_secrets AS secret
  WHERE p_channel_code IN ('telegram', 'max')
    AND p_token_hash ~ '^[0-9a-f]{64}$'
    AND secret.channel_code = p_channel_code
    AND secret.token_hash = p_token_hash
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_mark_secret_used(p_secret_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- The row id comes only from the opaque-token lookup; update is limited to that exact row.
  UPDATE public.channel_link_secrets AS secret
  SET used_at = statement_timestamp()
  WHERE p_secret_id IS NOT NULL
    AND secret.id = p_secret_id;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_lock_unused_secret(p_secret_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Claim recheck locks only the exact row id obtained from the opaque-token bearer lookup.
  PERFORM 1
  FROM public.channel_link_secrets AS secret
  WHERE p_secret_id IS NOT NULL
    AND secret.id = p_secret_id
    AND secret.used_at IS NULL
  FOR UPDATE;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_mark_secret_used_if_unused(p_secret_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Claim/merge completion is idempotent and can consume only the exact bearer-derived unused row.
  UPDATE public.channel_link_secrets AS secret
  SET used_at = statement_timestamp()
  WHERE p_secret_id IS NOT NULL
    AND secret.id = p_secret_id
    AND secret.used_at IS NULL;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_email_setup_revoke_active(
  p_user_id uuid,
  p_email_normalized text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF p_user_id IS NULL OR p_email_normalized IS NULL OR btrim(p_email_normalized) = '' THEN
    RETURN 0;
  END IF;

  -- Issuance revokes only the exact user's exact normalized-email active tokens.
  UPDATE public.user_email_setup_tokens AS token
  SET revoked_at = statement_timestamp()
  WHERE token.user_id = p_user_id
    AND token.email_normalized = p_email_normalized
    AND token.used_at IS NULL
    AND token.revoked_at IS NULL;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_email_setup_insert(
  p_user_id uuid,
  p_email_normalized text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_source text,
  p_created_by_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL
     OR p_email_normalized IS NULL
     OR btrim(p_email_normalized) = ''
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '25 hours'
     OR p_source NOT IN ('rubitime', 'doctor_profile', 'manual_resend', 'registration_claim')
  THEN
    RAISE EXCEPTION 'invalid_email_setup_token';
  END IF;

  -- Inserts one exact user/email token; only the opaque hash is stored and returned id identifies it.
  INSERT INTO public.user_email_setup_tokens (
    user_id,
    email_normalized,
    token_hash,
    expires_at,
    source,
    created_by_user_id
  )
  VALUES (
    p_user_id,
    p_email_normalized,
    p_token_hash,
    p_expires_at,
    p_source,
    p_created_by_user_id
  )
  RETURNING user_email_setup_tokens.id INTO v_id;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_email_setup_delete(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Rollback can delete only the exact id returned by the immediately preceding issuance action.
  DELETE FROM public.user_email_setup_tokens AS token
  WHERE p_token_id IS NOT NULL
    AND token.id = p_token_id;

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_email_setup_read(p_token_hash text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email_normalized text,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- The 256-bit peppered setup-token hash is the bearer capability; no email/user scan is exposed.
  SELECT token.id, token.user_id, token.email_normalized, token.expires_at, token.used_at, token.revoked_at
  FROM public.user_email_setup_tokens AS token
  WHERE p_token_hash ~ '^[0-9a-f]{64}$'
    AND token.token_hash = p_token_hash
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.auth_email_setup_mark_used(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Consume only the exact bearer-derived active token, once, before its database-clock expiry.
  UPDATE public.user_email_setup_tokens AS token
  SET used_at = statement_timestamp()
  WHERE p_token_id IS NOT NULL
    AND token.id = p_token_id
    AND token.used_at IS NULL
    AND token.revoked_at IS NULL
    AND token.expires_at >= statement_timestamp();

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_list_user_providers(p_user_id uuid)
RETURNS TABLE (provider text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- Exact server-resolved user id only; returns provider names, never provider ids or other users.
  SELECT DISTINCT binding.provider
  FROM public.user_oauth_bindings AS binding
  WHERE p_user_id IS NOT NULL
    AND binding.user_id = p_user_id
    AND binding.provider IN ('google', 'apple', 'yandex')
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_find_user(
  p_provider text,
  p_provider_user_id text
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- The callback has proved this exact provider identity; no email or prefix lookup is available.
  SELECT binding.user_id
  FROM public.user_oauth_bindings AS binding
  WHERE p_provider IN ('google', 'apple', 'yandex')
    AND p_provider_user_id IS NOT NULL
    AND btrim(p_provider_user_id) <> ''
    AND binding.provider = p_provider
    AND binding.provider_user_id = p_provider_user_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_upsert_binding(
  p_user_id uuid,
  p_provider text,
  p_provider_user_id text,
  p_email text
)
RETURNS TABLE (
  inserted boolean,
  user_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_user_id IS NULL
     OR p_provider NOT IN ('google', 'apple', 'yandex')
     OR p_provider_user_id IS NULL
     OR btrim(p_provider_user_id) = ''
  THEN
    RETURN;
  END IF;

  -- The verified provider tuple may bind once; a collision returns only that same tuple's owner.
  INSERT INTO public.user_oauth_bindings (user_id, provider, provider_user_id, email)
  VALUES (p_user_id, p_provider, p_provider_user_id, p_email)
  ON CONFLICT (provider, provider_user_id) DO NOTHING
  RETURNING user_oauth_bindings.user_id INTO v_user_id;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, binding.user_id
  FROM public.user_oauth_bindings AS binding
  WHERE binding.provider = p_provider
    AND binding.provider_user_id = p_provider_user_id
  LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_create(
  p_token_hash text,
  p_user_id uuid,
  p_method text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_user_id IS NULL
     OR p_method NOT IN ('telegram', 'max')
     OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'invalid_login_token';
  END IF;

  -- Creates one pending row for the server-generated opaque token and exact resolved user.
  INSERT INTO public.login_tokens (token_hash, user_id, method, status, expires_at)
  VALUES (p_token_hash, p_user_id, p_method, 'pending', p_expires_at)
  RETURNING login_tokens.id INTO v_id;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_read(p_token_hash text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  method text,
  status text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  session_issued_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- The unguessable SHA-256 token hash is the bearer capability; no user/status scan is exposed.
  SELECT
    token.id,
    token.user_id,
    token.method,
    token.status,
    token.expires_at,
    token.confirmed_at,
    token.session_issued_at
  FROM public.login_tokens AS token
  WHERE p_token_hash ~ '^[0-9a-f]{64}$'
    AND token.token_hash = p_token_hash
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_expire_past()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Database time is authoritative; callers cannot choose a cutoff or learn how many rows expired.
  UPDATE public.login_tokens AS token
  SET status = 'expired'
  WHERE token.status = 'pending'
    AND token.expires_at < statement_timestamp();
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_confirm(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Confirm only the exact opaque token while pending and unexpired by the database clock.
  UPDATE public.login_tokens AS token
  SET status = 'confirmed',
      confirmed_at = statement_timestamp()
  WHERE p_token_hash ~ '^[0-9a-f]{64}$'
    AND token.token_hash = p_token_hash
    AND token.status = 'pending'
    AND token.expires_at >= statement_timestamp();

  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_mark_session_issued(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Mark session issuance once for the exact opaque confirmed token; no caller-supplied timestamp.
  UPDATE public.login_tokens AS token
  SET session_issued_at = statement_timestamp()
  WHERE p_token_hash ~ '^[0-9a-f]{64}$'
    AND token.token_hash = p_token_hash
    AND token.status = 'confirmed'
    AND token.session_issued_at IS NULL;

  RETURN FOUND;
END
$function$;

DO $bootstrap_auth_accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.auth_user_pin_read(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_user_pin_upsert(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_user_pin_increment_failed(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_user_pin_reset_attempts(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_channel_link_replace_secret(uuid, text, text, timestamptz) OWNER TO app_owner;
    ALTER FUNCTION app.auth_channel_link_read_secret(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_channel_link_mark_secret_used(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_channel_link_lock_unused_secret(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_channel_link_mark_secret_used_if_unused(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_email_setup_revoke_active(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_email_setup_delete(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_email_setup_read(text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_email_setup_mark_used(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_oauth_list_user_providers(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.auth_oauth_find_user(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_oauth_upsert_binding(uuid, text, text, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_login_token_create(text, uuid, text, timestamptz) OWNER TO app_owner;
    ALTER FUNCTION app.auth_login_token_read(text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_login_token_expire_past() OWNER TO app_owner;
    ALTER FUNCTION app.auth_login_token_confirm(text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_login_token_mark_session_issued(text) OWNER TO app_owner;
  END IF;
END
$bootstrap_auth_accessor_owner$;

REVOKE ALL ON FUNCTION app.auth_user_pin_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_upsert(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_increment_failed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_reset_attempts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_channel_link_replace_secret(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_channel_link_read_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_channel_link_mark_secret_used(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_channel_link_lock_unused_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_channel_link_mark_secret_used_if_unused(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_email_setup_revoke_active(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_email_setup_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_email_setup_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_email_setup_mark_used(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_oauth_list_user_providers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_oauth_find_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_oauth_upsert_binding(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_login_token_create(text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_login_token_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_login_token_expire_past() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_login_token_confirm(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_login_token_mark_session_issued(text) FROM PUBLIC;

COMMENT ON FUNCTION app.auth_user_pin_read(uuid) IS
  'Bootstrap PIN bearer read: exact server-resolved user UUID only; never scans user_pins.';
COMMENT ON FUNCTION app.auth_user_pin_increment_failed(uuid) IS
  'Bootstrap PIN lockout action: exact user UUID, fixed five-attempt/15-minute policy.';
COMMENT ON FUNCTION app.auth_channel_link_read_secret(text, text) IS
  'Bootstrap channel-link bearer read: exact channel plus peppered opaque token hash only.';
COMMENT ON FUNCTION app.auth_email_setup_read(text) IS
  'Bootstrap email-setup bearer read: exact peppered opaque token hash only.';
COMMENT ON FUNCTION app.auth_oauth_find_user(text, text) IS
  'Bootstrap OAuth identity read: exact verified provider and provider-user-id tuple only.';
COMMENT ON FUNCTION app.auth_login_token_read(text) IS
  'Bootstrap messenger-login bearer read: exact opaque token hash only.';
