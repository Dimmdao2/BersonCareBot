-- Explicitly invoked unjournaled post-zero cutover artifact.
-- It is intentionally outside Drizzle: installer `install-post-zero.mjs` runs it only
-- after the target database zero-state verifier and inside the same atomic transaction.

-- The transaction-bound port contract replaces the legacy signed session-row
-- context completely. Retaining either installer would leave a second DB door.
DROP FUNCTION IF EXISTS app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS app.release_principal_context();
DROP FUNCTION IF EXISTS app.reset_principal_context();

-- Four password-login functions predate the transaction-bound context contract. Keep their
-- reviewed business bodies byte-for-byte behind private implementation names and expose only
-- exact-gated wrappers under the runtime identities. The zero phase has already revoked every
-- historical EXECUTE ACL before this rename runs.
DO $password_login_private_implementations$
BEGIN
  IF to_regprocedure('app.password_login_acquire_impl(text,text,uuid,text)') IS NULL THEN
    ALTER FUNCTION app.password_login_acquire(text,text,uuid,text)
      RENAME TO password_login_acquire_impl;
  END IF;
  IF to_regprocedure('app.password_login_complete_impl(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION app.password_login_complete(uuid,boolean)
      RENAME TO password_login_complete_impl;
  END IF;
  IF to_regprocedure('app.password_login_issue_altcha_challenge_impl(text,uuid,text,timestamp with time zone)') IS NULL THEN
    ALTER FUNCTION app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)
      RENAME TO password_login_issue_altcha_challenge_impl;
  END IF;
  IF to_regprocedure('app.password_login_read_altcha_secret_impl()') IS NULL THEN
    ALTER FUNCTION app.password_login_read_altcha_secret()
      RENAME TO password_login_read_altcha_secret_impl;
  END IF;
END
$password_login_private_implementations$;

CREATE OR REPLACE FUNCTION app.password_login_acquire(
  p_email_normalized text,
  p_identifier_key text,
  p_altcha_challenge_id uuid DEFAULT NULL,
  p_altcha_challenge_digest text DEFAULT NULL
)
RETURNS TABLE (
  status text,
  lease_token uuid,
  password_hash text,
  user_id uuid,
  email_verified boolean,
  retry_after_seconds integer,
  captcha_required boolean
)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session', 'auth.password.acquire',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_email_normalized))::app.port_typed_arg,
      ROW('text@1', textsend(p_identifier_key))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_altcha_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_altcha_challenge_digest))::app.port_typed_arg
    ]), 'app.password_login_acquire(text,text,uuid,text)'::regprocedure
  );
  RETURN QUERY
  SELECT * FROM app.password_login_acquire_impl(
    p_email_normalized, p_identifier_key, p_altcha_challenge_id, p_altcha_challenge_digest
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.password_login_complete(
  p_lease_token uuid,
  p_password_verified boolean
)
RETURNS TABLE (
  accepted boolean,
  succeeded boolean,
  user_id uuid,
  email_verified boolean,
  attempts integer,
  retry_after_seconds integer,
  captcha_required boolean
)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session', 'auth.password.complete',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_lease_token))::app.port_typed_arg,
      ROW('boolean@1', boolsend(p_password_verified))::app.port_typed_arg
    ]), 'app.password_login_complete(uuid,boolean)'::regprocedure
  );
  RETURN QUERY
  SELECT * FROM app.password_login_complete_impl(p_lease_token, p_password_verified);
END
$function$;

CREATE OR REPLACE FUNCTION app.password_login_issue_altcha_challenge(
  p_email_normalized text,
  p_challenge_id uuid,
  p_challenge_digest text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session', 'auth.password.altcha-issue',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_email_normalized))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge_digest))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]),
    'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure
  );
  RETURN app.password_login_issue_altcha_challenge_impl(
    p_email_normalized, p_challenge_id, p_challenge_digest, p_expires_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.password_login_read_altcha_secret()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session', 'auth.password.altcha-secret',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.password_login_read_altcha_secret()'::regprocedure
  );
  RETURN app.password_login_read_altcha_secret_impl();
END
$function$;

-- `telegram_state.username` was a live display fact, not dialogue state. Preserve it on the
-- canonical channel binding before the phase-3 integrator drop chain removes identities/state.
ALTER TABLE public.user_channel_bindings
  ADD COLUMN IF NOT EXISTS display_handle text;

DO $carry_channel_display_handle$
DECLARE
  v_legacy_handles bigint;
  v_unmapped_handles bigint;
  v_carried_handles bigint;
BEGIN
  IF to_regclass('integrator.telegram_state') IS NULL THEN
    RAISE NOTICE '0385: integrator.telegram_state absent — canonical display_handle column installed; no legacy handle source remains.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_legacy_handles
    FROM integrator.telegram_state state
   WHERE NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL;

  IF v_legacy_handles = 0 THEN
    RAISE NOTICE '0385: telegram_state has no non-empty display handles to carry.';
    RETURN;
  END IF;

  IF to_regclass('integrator.identities') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = format('0385: cannot carry %s Telegram display handle(s): integrator.identities is absent', v_legacy_handles);
  END IF;

  SELECT count(*) INTO v_unmapped_handles
    FROM integrator.telegram_state state
    JOIN integrator.identities identity ON identity.id = state.identity_id
    LEFT JOIN public.user_channel_bindings binding
      ON binding.channel_code = identity.resource
     AND binding.external_id = identity.external_id
   WHERE NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL
     AND (identity.resource <> 'telegram' OR binding.user_id IS NULL);

  IF v_unmapped_handles > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = format('0385: %s of %s Telegram display handle(s) have no exact canonical binding',
        v_unmapped_handles, v_legacy_handles);
  END IF;

  WITH carried AS (
    UPDATE public.user_channel_bindings binding
       SET display_handle = left(NULLIF(regexp_replace(btrim(state.username), '^@+', ''), ''), 32)
      FROM integrator.telegram_state state
      JOIN integrator.identities identity ON identity.id = state.identity_id
     WHERE identity.resource = 'telegram'
       AND binding.channel_code = identity.resource
       AND binding.external_id = identity.external_id
       AND NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL
       AND NULLIF(btrim(binding.display_handle), '') IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_carried_handles FROM carried;

  RAISE NOTICE '0385: preserved % legacy Telegram display handle(s); % canonical row(s) populated.',
    v_legacy_handles, v_carried_handles;
END
$carry_channel_display_handle$;

ALTER TABLE public.user_channel_bindings
  DROP CONSTRAINT IF EXISTS user_channel_bindings_display_handle_check;
ALTER TABLE public.user_channel_bindings
  ADD CONSTRAINT user_channel_bindings_display_handle_check
  CHECK (display_handle IS NULL OR (
    display_handle = btrim(display_handle)
    AND display_handle <> ''
    AND length(display_handle) <= 32
    AND display_handle !~ '^@'
  ));

COMMENT ON COLUMN public.user_channel_bindings.display_handle IS
  'Current channel-supplied public handle without a leading @; presentation adds @ where appropriate.';


-- One atomic admission root replaces the old prune/count/record command sequence.
-- Dropping the components also removes their historical EXECUTE ACLs.
DROP FUNCTION IF EXISTS app.auth_rate_limit_prune_scope(text, timestamptz, integer);
DROP FUNCTION IF EXISTS app.auth_rate_limit_prune_key(text, text, timestamptz);
DROP FUNCTION IF EXISTS app.auth_rate_limit_count(text, text);
DROP FUNCTION IF EXISTS app.auth_rate_limit_record(text, text);

CREATE OR REPLACE FUNCTION app.auth_rate_limit_check_and_record(
  p_scope text,
  p_key text,
  p_window_ms integer,
  p_limit integer,
  p_action text,
  p_scope_retention_ms integer,
  p_scope_prune_batch integer
)
RETURNS TABLE (limited boolean, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz;
  v_attempts integer;
  v_batch integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session',
    'auth.rate-limit.check-record',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_scope))::app.port_typed_arg,
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('integer@1', int4send(p_window_ms))::app.port_typed_arg,
      ROW('integer@1', int4send(p_limit))::app.port_typed_arg,
      ROW('text@1', textsend(p_action))::app.port_typed_arg,
      ROW('integer@1', int4send(p_scope_retention_ms))::app.port_typed_arg,
      ROW('integer@1', int4send(p_scope_prune_batch))::app.port_typed_arg
    ]),
    'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)'::regprocedure
  );
  v_now := statement_timestamp();

  IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 128
     OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024
     OR p_window_ms IS NULL OR p_window_ms < 1
     OR p_limit IS NULL OR p_limit < 0
     OR p_action IS DISTINCT FROM 'check_and_record'
     OR ((p_scope_retention_ms IS NULL) <> (p_scope_prune_batch IS NULL))
     OR (p_scope_retention_ms IS NOT NULL AND p_scope_retention_ms < p_window_ms)
     OR (p_scope_prune_batch IS NOT NULL AND p_scope_prune_batch < 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid auth rate-limit request';
  END IF;

  IF p_scope_retention_ms IS NOT NULL
     AND pg_try_advisory_xact_lock(hashtext('auth-rate-limit-scope-prune:' || p_scope)) THEN
    v_batch := LEAST(1000, p_scope_prune_batch);
    WITH stale AS (
      SELECT event.ctid
        FROM public.auth_rate_limit_events event
       WHERE event.scope = p_scope
         AND event.occurred_at <= v_now - p_scope_retention_ms * interval '1 millisecond'
       ORDER BY event.occurred_at
       LIMIT v_batch
       FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.auth_rate_limit_events event
    USING stale
    WHERE event.ctid = stale.ctid;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_scope || ':' || p_key));
  DELETE FROM public.auth_rate_limit_events event
   WHERE event.scope = p_scope
     AND event.key = p_key
     AND event.occurred_at <= v_now - p_window_ms * interval '1 millisecond';

  SELECT LEAST(count(*), 2147483647)::integer
    INTO v_attempts
    FROM public.auth_rate_limit_events event
   WHERE event.scope = p_scope
     AND event.key = p_key;

  IF v_attempts >= p_limit THEN
    RETURN QUERY SELECT true, v_attempts;
    RETURN;
  END IF;

  INSERT INTO public.auth_rate_limit_events (scope, key, occurred_at)
  VALUES (p_scope, p_key, v_now);
  RETURN QUERY SELECT false, v_attempts + 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_find_user(
  p_provider text,
  p_provider_user_id text
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_oauth_owner', 'app_pre_session', 'pre_session', 'auth.oauth.callback.find-binding',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_provider))::app.port_typed_arg,
      ROW('text@1', textsend(p_provider_user_id))::app.port_typed_arg
    ]), 'app.auth_oauth_find_user(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT binding.user_id
    FROM public.user_oauth_bindings binding
   WHERE p_provider IN ('google', 'apple', 'yandex')
     AND p_provider_user_id IS NOT NULL
     AND btrim(p_provider_user_id) <> ''
     AND binding.provider = p_provider
     AND binding.provider_user_id = p_provider_user_id
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_upsert_binding(
  p_user_id uuid,
  p_provider text,
  p_provider_user_id text,
  p_email text
)
RETURNS TABLE (inserted boolean, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_oauth_owner', 'app_pre_session', 'pre_session', 'auth.oauth.callback.upsert-binding',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_provider))::app.port_typed_arg,
      ROW('text@1', textsend(p_provider_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_email))::app.port_typed_arg
    ]), 'app.auth_oauth_upsert_binding(uuid,text,text,text)'::regprocedure
  );
  IF p_user_id IS NULL
     OR p_provider NOT IN ('google', 'apple', 'yandex')
     OR p_provider_user_id IS NULL
     OR btrim(p_provider_user_id) = '' THEN
    RETURN;
  END IF;

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
    FROM public.user_oauth_bindings binding
   WHERE binding.provider = p_provider
     AND binding.provider_user_id = p_provider_user_id
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_create(
  p_token_hash text, p_user_id uuid, p_method text, p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_login_token_owner', 'app_pre_session', 'pre_session', 'auth.login-token.create',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_method))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]), 'app.auth_login_token_create(text,uuid,text,timestamp with time zone)'::regprocedure
  );
  IF p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_user_id IS NULL
     OR p_method NOT IN ('telegram', 'max')
     OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_login_token';
  END IF;
  INSERT INTO public.login_tokens (token_hash, user_id, method, status, expires_at)
  VALUES (p_token_hash, p_user_id, p_method, 'pending', p_expires_at)
  RETURNING login_tokens.id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_read(p_token_hash text)
RETURNS TABLE(
  id uuid, user_id uuid, method text, status text, expires_at timestamptz,
  confirmed_at timestamptz, session_issued_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_login_token_owner', 'app_pre_session', 'pre_session', 'auth.login-token.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg
    ]), 'app.auth_login_token_read(text)'::regprocedure
  );
  RETURN QUERY
  SELECT token.id, token.user_id, token.method, token.status, token.expires_at,
         token.confirmed_at, token.session_issued_at
    FROM public.login_tokens token
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_expire_past()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_login_token_owner', 'app_pre_session', 'pre_session', 'auth.login-token.expire',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.auth_login_token_expire_past()'::regprocedure
  );
  UPDATE public.login_tokens token
     SET status = 'expired'
   WHERE token.status = 'pending'
     AND token.expires_at < statement_timestamp();
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_confirm(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_login_token_owner', 'app_pre_session', 'pre_session', 'auth.login-token.confirm',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg
    ]), 'app.auth_login_token_confirm(text)'::regprocedure
  );
  UPDATE public.login_tokens token
     SET status = 'confirmed', confirmed_at = statement_timestamp()
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
     AND token.status = 'pending'
     AND token.expires_at >= statement_timestamp();
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_login_token_mark_session_issued(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_login_token_owner', 'app_pre_session', 'pre_session', 'auth.login-token.session-issued',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_token_hash))::app.port_typed_arg
    ]), 'app.auth_login_token_mark_session_issued(text)'::regprocedure
  );
  UPDATE public.login_tokens token
     SET session_issued_at = statement_timestamp()
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
     AND token.status = 'confirmed'
     AND token.session_issued_at IS NULL;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)
RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner', 'app_pre_session', 'pre_session',
    'config.runtime.public.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('text@1', textsend(p_scope))::app.port_typed_arg
    ]), 'app.read_public_runtime_setting(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
    FROM public.app_runtime_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.audience = 'public'
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner', 'app_pre_session', 'pre_session',
    'config.runtime.server.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('text@1', textsend(p_scope))::app.port_typed_arg
    ]), 'app.read_webapp_server_runtime_setting(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
    FROM public.app_runtime_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.audience = 'server'
     AND setting.key IN (
       'debug_forward_to_admin', 'video_presign_ttl_seconds',
       'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
       'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones', 'auth_2fa_enabled'
     )
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_smtp_outbound_configured()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'auth.channel.smtp.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_smtp_outbound_configured()'::regprocedure
  );
  SELECT COALESCE(
    NULLIF(btrim(setting.value_json #>> '{value,host}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,user}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,password}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,from}'), '') IS NOT NULL,
    false
  ) INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'smtp_outbound'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN COALESCE(configured, false);
END
$function$;

CREATE OR REPLACE FUNCTION app.is_sms_provider_configured()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'auth.channel.sms.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_sms_provider_configured()'::regprocedure
  );
  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'smsc_api_key'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:smsc_api_key'; END IF;
  RETURN configured;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_telegram_login_configured()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'auth.channel.telegram.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_telegram_login_configured()'::regprocedure
  );
  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.app_runtime_settings setting
   WHERE setting.key = 'telegram_login_bot_username'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
     AND setting.audience = 'public';
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:telegram_login_bot_username'; END IF;
  RETURN configured;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_max_bot_configured()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'auth.channel.max.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_max_bot_configured()'::regprocedure
  );
  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'max_bot_api_key'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:max_bot_api_key'; END IF;
  RETURN configured;
END
$function$;


CREATE OR REPLACE FUNCTION app.passkey_issue_challenge(
  p_id uuid,
  p_purpose text,
  p_user_id uuid,
  p_challenge text,
  p_expected_origin text,
  p_rp_id text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.issue'
         ELSE 'auth.passkey.challenge.issue' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge))::app.port_typed_arg,
      ROW('text@1', textsend(p_expected_origin))::app.port_typed_arg,
      ROW('text@1', textsend(p_rp_id))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]), 'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)'::regprocedure
  );

  IF p_purpose NOT IN ('authentication', 'registration')
    OR p_id IS NULL
    OR p_challenge !~ '^[A-Za-z0-9_-]{32,1024}$'
    OR p_expected_origin IS NULL
    OR p_rp_id IS NULL
    OR p_expires_at <= statement_timestamp()
    OR p_expires_at > statement_timestamp() + interval '10 minutes'
    OR (p_purpose = 'registration' AND (
      p_user_id IS NULL OR p_user_id IS DISTINCT FROM app.current_patient_user_id()
    ))
    OR (p_purpose = 'authentication' AND p_user_id IS NOT NULL)
  THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_passkey_challenges
   WHERE expires_at < statement_timestamp() - interval '1 day';
  INSERT INTO public.user_passkey_challenges (
    id, purpose, user_id, challenge, expected_origin, rp_id, expires_at
  ) VALUES (
    p_id, p_purpose, p_user_id, p_challenge, p_expected_origin, p_rp_id, p_expires_at
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_read_challenge(p_id uuid, p_purpose text)
RETURNS TABLE (
  user_id uuid, challenge text, expected_origin text, rp_id text, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.read'
         ELSE 'auth.passkey.challenge.read' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg
    ]), 'app.passkey_read_challenge(uuid,text)'::regprocedure
  );
  IF p_purpose NOT IN ('authentication', 'registration') THEN RETURN; END IF;
  RETURN QUERY
  SELECT stored.user_id, stored.challenge, stored.expected_origin, stored.rp_id, stored.expires_at
    FROM public.user_passkey_challenges AS stored
   WHERE stored.id = p_id
     AND stored.purpose = p_purpose
     AND stored.consumed_at IS NULL
     AND stored.expires_at >= statement_timestamp();
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_read_credential(p_credential_id text)
RETURNS TABLE (
  credential_id text, user_id uuid, user_handle text, public_key text, counter bigint,
  transports jsonb, device_type text, backed_up boolean
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner', 'app_pre_session', 'pre_session', 'auth.passkey.credential.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_credential_id))::app.port_typed_arg
    ]), 'app.passkey_read_credential(text)'::regprocedure
  );
  RETURN QUERY
  SELECT credential.credential_id, credential.user_id, account.user_handle, credential.public_key,
         credential.counter, credential.transports, credential.device_type, credential.backed_up
    FROM public.user_passkey_credentials AS credential
    JOIN public.user_passkey_accounts AS account ON account.user_id = credential.user_id
   WHERE p_credential_id ~ '^[A-Za-z0-9_-]{16,1024}$'
     AND credential.credential_id = p_credential_id
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_complete_authentication(
  p_challenge_id uuid,
  p_credential_id text,
  p_previous_counter bigint,
  p_new_counter bigint,
  p_device_type text,
  p_backed_up boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner', 'app_pre_session', 'pre_session', 'auth.passkey.authentication.complete',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_credential_id))::app.port_typed_arg,
      ROW('bigint@1', int8send(p_previous_counter))::app.port_typed_arg,
      ROW('bigint@1', int8send(p_new_counter))::app.port_typed_arg,
      ROW('text@1', textsend(p_device_type))::app.port_typed_arg,
      ROW('boolean@1', boolsend(p_backed_up))::app.port_typed_arg
    ]), 'app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)'::regprocedure
  );
  UPDATE public.user_passkey_challenges AS stored
     SET consumed_at = statement_timestamp()
   WHERE stored.id = p_challenge_id
     AND stored.purpose = 'authentication'
     AND stored.consumed_at IS NULL
     AND stored.expires_at >= statement_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.user_passkey_credentials AS credential
     SET counter = p_new_counter,
         device_type = p_device_type,
         backed_up = p_backed_up,
         last_used_at = statement_timestamp()
   WHERE credential.credential_id = p_credential_id
     AND credential.counter = p_previous_counter
  RETURNING credential.user_id INTO v_user_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'passkey_credential_state_changed'; END IF;
  RETURN v_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_replace_secret(
  p_user_id uuid, p_channel_code text, p_token_hash text, p_expires_at timestamptz
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_worker', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure);
  IF p_user_id IS NULL OR p_channel_code NOT IN ('telegram', 'max')
     OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes'
  THEN RAISE EXCEPTION 'invalid_channel_link_secret'; END IF;
  DELETE FROM public.channel_link_secrets AS secret
   WHERE secret.user_id = p_user_id AND secret.channel_code = p_channel_code;
  INSERT INTO public.channel_link_secrets (user_id, channel_code, token_hash, expires_at)
  VALUES (p_user_id, p_channel_code, p_token_hash, p_expires_at);
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_read_secret(p_channel_code text, p_token_hash text)
RETURNS TABLE (id uuid, user_id uuid, expires_at timestamptz, used_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_worker', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure);
  RETURN QUERY SELECT secret.id, secret.user_id, secret.expires_at, secret.used_at
    FROM public.channel_link_secrets AS secret
   WHERE p_channel_code IN ('telegram', 'max') AND p_token_hash ~ '^[0-9a-f]{64}$'
     AND secret.channel_code = p_channel_code AND secret.token_hash = p_token_hash LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_mark_secret_used(p_secret_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_worker', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure);
  UPDATE public.channel_link_secrets AS secret SET used_at = statement_timestamp()
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_lock_unused_secret(p_secret_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_worker', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure);
  PERFORM 1 FROM public.channel_link_secrets AS secret
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id AND secret.used_at IS NULL FOR UPDATE;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_channel_link_mark_secret_used_if_unused(p_secret_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_worker', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure);
  UPDATE public.channel_link_secrets AS secret SET used_at = statement_timestamp()
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id AND secret.used_at IS NULL;
  RETURN FOUND;
END
$function$;

DROP FUNCTION IF EXISTS app.read_saas_billing_payment_provider();

CREATE OR REPLACE FUNCTION app.read_saas_billing_payment_provider_preauth()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner', 'app_pre_session', 'pre_session', 'billing.webhook.provider.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_saas_billing_payment_provider_preauth()'::regprocedure
  );
  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_saas_billing_payment_provider_clinic()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner', 'app_clinic_billing', 'staff', 'billing.clinic.provider.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_saas_billing_payment_provider_clinic()'::regprocedure
  );
  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_saas_billing_payment_provider_platform()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner', 'app_platform_settings', 'platform', 'billing.platform.provider.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_saas_billing_payment_provider_platform()'::regprocedure
  );
  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$function$;

CREATE OR REPLACE FUNCTION app.resolve_saas_billing_invoice_for_webhook(
  p_provider_id text,
  p_provider_invoice_ref text
)
RETURNS TABLE (id uuid, organization_id uuid, amount_minor integer, currency text)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner', 'app_worker', 'service', 'billing.webhook.invoice.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_provider_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_provider_invoice_ref))::app.port_typed_arg
    ]), 'app.resolve_saas_billing_invoice_for_webhook(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT invoice.id, invoice.organization_id, invoice.amount_minor, invoice.currency
    FROM public.saas_billing_invoices AS invoice
   WHERE invoice.provider_id = p_provider_id
     AND invoice.provider_invoice_ref = p_provider_invoice_ref
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.resolve_saas_billing_refund_for_webhook(
  p_provider_id text,
  p_provider_refund_ref text
)
RETURNS TABLE (
  id uuid, organization_id uuid, saas_billing_invoice_id uuid, amount_minor integer,
  currency text, status text, provider_id text, provider_refund_ref text,
  provider_idempotency_key text, confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner', 'app_worker', 'service', 'billing.webhook.refund.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_provider_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_provider_refund_ref))::app.port_typed_arg
    ]), 'app.resolve_saas_billing_refund_for_webhook(text,text)'::regprocedure
  );
  RETURN QUERY
  SELECT refund.id, refund.organization_id, refund.saas_billing_invoice_id, refund.amount_minor,
         refund.currency, refund.status, refund.provider_id, refund.provider_refund_ref,
         refund.provider_idempotency_key, refund.confirmed_at, refund.created_at, refund.updated_at
    FROM public.saas_billing_refunds AS refund
   WHERE refund.provider_id = p_provider_id
     AND refund.provider_refund_ref = p_provider_refund_ref
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.get_public_reference_baseline(p_category_code text)
RETURNS TABLE (
  id uuid, category_id uuid, code text, title text, sort_order integer, is_active boolean,
  deleted_at timestamptz, meta_json jsonb
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_catalog_public_owner', 'app_pre_session', 'pre_session', 'catalog.public-reference.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_category_code))::app.port_typed_arg
    ]), 'app.get_public_reference_baseline(text)'::regprocedure
  );
  RETURN QUERY
  WITH latest AS (
    SELECT definition_json FROM public.reference_catalog_baselines ORDER BY version DESC LIMIT 1
  ), category AS (
    SELECT value AS definition
      FROM latest, jsonb_array_elements(definition_json->'categories')
     WHERE value->>'code' = p_category_code AND p_category_code <> 'visit_manipulation'
  )
  SELECT md5('public-reference-item:' || p_category_code || ':' || ((expanded.item_definition::jsonb)->>0))::uuid,
         md5('public-reference-category:' || p_category_code)::uuid,
         (expanded.item_definition::jsonb)->>0,
         (expanded.item_definition::jsonb)->>1,
         ((expanded.item_definition::jsonb)->>2)::integer,
         true, NULL::timestamptz, COALESCE((expanded.item_definition::jsonb)->3, '{}'::jsonb)
    FROM category
    CROSS JOIN LATERAL jsonb_array_elements(category.definition->'items') AS expanded(item_definition)
   ORDER BY ((expanded.item_definition::jsonb)->>2)::integer, (expanded.item_definition::jsonb)->>1;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_organization_slug_available(p_slug text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE available boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_slug_owner', 'app_pre_session', 'pre_session',
    'auth.specialist-signup.slug-availability',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_slug))::app.port_typed_arg
    ]), 'app.is_organization_slug_available(text)'::regprocedure
  );
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_slug_claims AS claim
     WHERE lower(claim.slug) = lower(p_slug)
  ) INTO available;
  RETURN available;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_webapp_preauth_provider_setting(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_pre_session', 'pre_session',
    'config.preauth-provider.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg
    ]), 'app.read_webapp_preauth_provider_setting(text)'::regprocedure
  );
  SELECT setting.value_json INTO value
    FROM public.system_settings AS setting
   WHERE p_key IN (
      'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
      'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
      'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
      'apple_oauth_key_id', 'apple_oauth_private_key',
      'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri',
      'telegram_bot_token'
    )
     AND setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN value;
END
$function$;

CREATE OR REPLACE FUNCTION app.resolve_public_organization_slug(p_slug text)
RETURNS TABLE (
  organization_id uuid, requested_slug text, requested_kind text, canonical_slug text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_slug_owner', 'app_pre_session', 'pre_session', 'booking.public-slug.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_slug))::app.port_typed_arg
    ]), 'app.resolve_public_organization_slug(text)'::regprocedure
  );
  RETURN QUERY
  SELECT requested.organization_id, requested.slug, requested.kind, current_claim.slug
    FROM public.organization_slug_claims AS requested
    JOIN public.organization_slug_claims AS current_claim
      ON current_claim.organization_id = requested.organization_id AND current_claim.kind = 'current'
    JOIN public.clinic_public_directory_entries AS directory
      ON directory.organization_id = requested.organization_id AND directory.is_published = true
    JOIN public.be_organizations AS organization
      ON organization.id = requested.organization_id AND organization.is_active = true
   WHERE requested.slug = lower(btrim(p_slug))
     AND requested.kind IN ('current', 'alias')
   LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.resolve_public_organization_by_slug(p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE resolved uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_slug_owner', 'app_pre_session', 'pre_session',
    'booking.public-organization.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_slug))::app.port_typed_arg
    ]), 'app.resolve_public_organization_by_slug(text)'::regprocedure
  );
  SELECT requested.organization_id INTO resolved
    FROM public.organization_slug_claims AS requested
    JOIN public.organization_slug_claims AS current_claim
      ON current_claim.organization_id = requested.organization_id AND current_claim.kind = 'current'
    JOIN public.clinic_public_directory_entries AS directory
      ON directory.organization_id = requested.organization_id AND directory.is_published = true
    JOIN public.be_organizations AS organization
      ON organization.id = requested.organization_id AND organization.is_active = true
   WHERE requested.slug = lower(btrim(p_slug))
     AND requested.kind IN ('current', 'alias')
   LIMIT 1;
  RETURN resolved;
END
$function$;

CREATE OR REPLACE FUNCTION app.get_web_push_vapid_public_key()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE public_key text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_preauth_owner', 'app_patient', 'patient',
    'patient.web-push.vapid-public-key.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.get_web_push_vapid_public_key()'::regprocedure
  );
  SELECT NULLIF(btrim(setting.value_json #>> '{value,publicKey}'), '') INTO public_key
    FROM public.system_settings AS setting
   WHERE setting.key = 'web_push_vapid'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN public_key;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_integrator_migration_ledger()
RETURNS TABLE(version text, applied_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_catalog_admin_owner', 'app_service', 'service', 'migration.ledger.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_integrator_migration_ledger()'::regprocedure
  );
  RETURN QUERY SELECT m.version, m.applied_at FROM integrator.schema_migrations m ORDER BY m.version;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_integrator_projection_health(p_retry_threshold integer)
RETURNS TABLE(
  pending_count bigint,
  dead_count bigint,
  cancelled_count bigint,
  oldest_pending_at text,
  processing_count bigint,
  retry_distribution jsonb,
  last_success_at text,
  retries_over_threshold bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.projection-health.read',
    app.hash_port_typed_args(ARRAY[
      ROW('integer@1', int4send(p_retry_threshold))::app.port_typed_arg
    ]), 'app.read_integrator_projection_health(integer)'::regprocedure
  );
  IF p_retry_threshold IS NULL OR p_retry_threshold < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'retry threshold must be non-negative';
  END IF;
  RETURN QUERY
  WITH summary AS (
    SELECT
      count(*) FILTER (WHERE outbox.status = 'pending') AS pending_count,
      count(*) FILTER (WHERE outbox.status = 'dead') AS dead_count,
      count(*) FILTER (WHERE outbox.status = 'cancelled') AS cancelled_count,
      (min(outbox.next_try_at) FILTER (WHERE outbox.status = 'pending'))::text AS oldest_pending_at,
      count(*) FILTER (WHERE outbox.status = 'processing') AS processing_count,
      (max(outbox.updated_at) FILTER (WHERE outbox.status = 'done'))::text AS last_success_at,
      count(*) FILTER (
        WHERE outbox.status IN ('pending', 'processing')
          AND outbox.attempts_done >= p_retry_threshold
      ) AS retries_over_threshold
    FROM integrator.projection_outbox AS outbox
  ), retry_counts AS (
    SELECT coalesce(jsonb_object_agg(retries.attempts_done::text, retries.row_count
      ORDER BY retries.attempts_done), '{}'::jsonb) AS retry_distribution
    FROM (
      SELECT outbox.attempts_done, count(*) AS row_count
      FROM integrator.projection_outbox AS outbox
      WHERE outbox.status IN ('pending', 'processing')
      GROUP BY outbox.attempts_done
    ) AS retries
  )
  SELECT summary.pending_count, summary.dead_count, summary.cancelled_count,
    summary.oldest_pending_at, summary.processing_count, retry_counts.retry_distribution,
    summary.last_success_at, summary.retries_over_threshold
  FROM summary CROSS JOIN retry_counts;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_patient_telegram_display_handle(p_platform_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_handle text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_staff', 'staff', 'messaging.patient-telegram-handle.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg
    ]), 'app.read_patient_telegram_display_handle(uuid)'::regprocedure
  );
  IF p_platform_user_id IS NULL OR app.current_org_id() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.be_organization_members member
     WHERE member.platform_user_id = p_platform_user_id
       AND member.organization_id = app.current_org_id()
       AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization patient required';
  END IF;
  SELECT binding.display_handle INTO v_handle
    FROM public.user_channel_bindings binding
   WHERE binding.user_id = p_platform_user_id
     AND binding.channel_code = 'telegram'
   LIMIT 1;
  RETURN v_handle;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_canonical_appointment_by_external_id(p_external_id text)
RETURNS TABLE(
  id uuid, organization_id uuid, phone_normalized text, start_at timestamptz, status text,
  attribution_json jsonb, branch_id uuid, created_at timestamptz, updated_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external appointment id required';
  END IF;
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_worker', 'service', 'booking.integrator-record.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg
    ]), 'app.read_canonical_appointment_by_external_id(text)'::regprocedure
  );
  RETURN QUERY
    WITH target AS (
      SELECT direct.canonical_id, 0 AS priority
        FROM (SELECT CASE
                       WHEN p_external_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       THEN substring(p_external_id FROM 4)::uuid
                     END AS canonical_id) direct
       WHERE direct.canonical_id IS NOT NULL
      UNION ALL
      SELECT mapping.canonical_id, 1 AS priority
        FROM public.be_external_entity_mappings mapping
       WHERE mapping.entity_type = 'appointment'
         AND mapping.external_system = 'rubitime'
         AND mapping.external_id = p_external_id
    )
    SELECT appointment.id, appointment.organization_id, appointment.phone_normalized,
           appointment.start_at, appointment.status, appointment.attribution_json,
           appointment.branch_id, appointment.created_at, appointment.updated_at,
           appointment.deleted_at
      FROM target
      JOIN public.be_appointments appointment ON appointment.id = target.canonical_id
     ORDER BY target.priority
     LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.list_active_canonical_appointments_by_phone(p_phone_normalized text)
RETURNS TABLE(
  id uuid, organization_id uuid, phone_normalized text, start_at timestamptz, status text,
  attribution_json jsonb, branch_id uuid, created_at timestamptz, updated_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  IF p_phone_normalized IS NULL OR btrim(p_phone_normalized) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'normalized phone required';
  END IF;
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_worker', 'service', 'booking.integrator-active.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_phone_normalized))::app.port_typed_arg
    ]), 'app.list_active_canonical_appointments_by_phone(text)'::regprocedure
  );
  RETURN QUERY
    SELECT appointment.id, appointment.organization_id, appointment.phone_normalized,
           appointment.start_at, appointment.status, appointment.attribution_json,
           appointment.branch_id, appointment.created_at, appointment.updated_at,
           appointment.deleted_at
      FROM public.be_appointments appointment
     WHERE appointment.phone_normalized = p_phone_normalized
       AND appointment.deleted_at IS NULL
       AND appointment.start_at >= now()
       AND appointment.status IN (
         'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
         'visit_confirmed', 'charged_to_package', 'manual_review_required'
       )
     ORDER BY appointment.start_at ASC;
END
$function$;

CREATE OR REPLACE FUNCTION app.count_active_canonical_appointments()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_count bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_service', 'service', 'booking.admin-active.count',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.count_active_canonical_appointments()'::regprocedure
  );
  SELECT count(*) INTO v_count
    FROM public.be_appointments appointment
   WHERE appointment.status IN (
     'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
     'visit_confirmed', 'charged_to_package', 'manual_review_required'
   )
     AND appointment.deleted_at IS NULL
     AND appointment.start_at >= now();
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.try_acquire_integrator_idempotency(p_key text, p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
DECLARE v_key text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.idempotency.acquire',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('integer@1', int4send(p_ttl_seconds))::app.port_typed_arg
    ]), 'app.try_acquire_integrator_idempotency(text,integer)'::regprocedure
  );
  IF p_key IS NULL OR btrim(p_key) = '' OR p_ttl_seconds IS NULL
     OR p_ttl_seconds < 1 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'bounded idempotency key and ttl required';
  END IF;
  INSERT INTO integrator.idempotency_keys AS target
    (key, request_hash, status, response_body, expires_at)
  VALUES (p_key, '__integrator_incoming_event__', 200, '{}'::jsonb,
    now() + p_ttl_seconds * interval '1 second')
  ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at,
    request_hash = EXCLUDED.request_hash, status = EXCLUDED.status, response_body = EXCLUDED.response_body
  WHERE target.expires_at < now()
  RETURNING key INTO v_key;
  RETURN v_key IS NOT NULL;
END
$function$;

CREATE OR REPLACE FUNCTION app.release_integrator_idempotency(p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.idempotency.release',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_key))::app.port_typed_arg]),
    'app.release_integrator_idempotency(text)'::regprocedure
  );
  DELETE FROM integrator.idempotency_keys WHERE key = p_key;
END
$function$;

CREATE OR REPLACE FUNCTION app.upsert_integration_data_quality_incident(
  p_integration text, p_entity text, p_external_id text, p_field text,
  p_raw_value text, p_timezone_used text, p_error_reason text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
DECLARE v_occurrences integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.data-quality.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_integration))::app.port_typed_arg,
      ROW('text@1', textsend(p_entity))::app.port_typed_arg,
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_field))::app.port_typed_arg,
      ROW('text@1', textsend(p_raw_value))::app.port_typed_arg,
      ROW('text@1', textsend(p_timezone_used))::app.port_typed_arg,
      ROW('text@1', textsend(p_error_reason))::app.port_typed_arg
    ]), 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)'::regprocedure
  );
  INSERT INTO integrator.integration_data_quality_incidents
    (integration, entity, external_id, field, raw_value, timezone_used, error_reason,
     status, first_seen_at, last_seen_at, occurrences)
  VALUES (p_integration, p_entity, p_external_id, p_field, p_raw_value, p_timezone_used,
    p_error_reason, 'open', now(), now(), 1)
  ON CONFLICT (integration, entity, external_id, field, error_reason) DO UPDATE SET
    last_seen_at = now(),
    occurrences = integrator.integration_data_quality_incidents.occurrences + 1,
    raw_value = COALESCE(EXCLUDED.raw_value, integrator.integration_data_quality_incidents.raw_value),
    timezone_used = COALESCE(EXCLUDED.timezone_used, integrator.integration_data_quality_incidents.timezone_used)
  RETURNING occurrences INTO v_occurrences;
  RETURN v_occurrences;
END
$function$;

CREATE OR REPLACE FUNCTION app.get_google_calendar_event_id(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_event_id text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.get',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.get_google_calendar_event_id(uuid)'::regprocedure
  );
  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  SELECT m.gcal_event_id INTO v_event_id FROM public.booking_calendar_map m
   WHERE m.appointment_key = 'be:' || p_appointment_id::text;
  RETURN v_event_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.upsert_google_calendar_event_id(p_appointment_id uuid, p_event_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_event_id))::app.port_typed_arg
    ]), 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure
  );
  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR NOT EXISTS (
    SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization and event id required'; END IF;
  INSERT INTO public.booking_calendar_map(appointment_key, gcal_event_id)
  VALUES ('be:' || p_appointment_id::text, p_event_id)
  ON CONFLICT (appointment_key) DO UPDATE SET gcal_event_id = EXCLUDED.gcal_event_id, updated_at = now();
  UPDATE public.patient_bookings SET gcal_event_id = p_event_id, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.delete_google_calendar_event_id(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.delete',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.delete_google_calendar_event_id(uuid)'::regprocedure
  );
  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  DELETE FROM public.booking_calendar_map WHERE appointment_key = 'be:' || p_appointment_id::text;
  UPDATE public.patient_bookings SET gcal_event_id = NULL, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.read_booking_calendar_patient_profile(p_appointment_id uuid)
RETURNS TABLE(is_problematic boolean, problematic_note text)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.patient-profile.read',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.read_booking_calendar_patient_profile(uuid)'::regprocedure
  );
  RETURN QUERY SELECT p.is_problematic, p.problematic_note
    FROM public.be_appointments a
    JOIN public.be_patient_booking_profiles p
      ON p.organization_id = a.organization_id AND p.platform_user_id = a.platform_user_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.read_booking_calendar_latest_staff_comment(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_body text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.staff-comment.read',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure
  );
  SELECT c.body INTO v_body FROM public.be_appointments a
    JOIN public.be_appointment_staff_comments c
      ON c.appointment_id = a.id AND c.organization_id = a.organization_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
   ORDER BY c.created_at DESC LIMIT 1;
  RETURN v_body;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_current_patient_self_booking_allowed()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_patient', 'patient', 'booking.self.allowed',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_current_patient_self_booking_allowed()'::regprocedure
  );
  RETURN NOT EXISTS (
    SELECT 1 FROM public.be_patient_booking_profiles p
     WHERE p.organization_id = app.current_org_id()
       AND p.platform_user_id = app.current_patient_user_id()
       AND p.booking_blocked
  );
END
$function$;

-- Exact pre-session roots which previously survived only as broad EXECUTE grants.
CREATE OR REPLACE FUNCTION app.email_auth_find_email_otp_lock(p_user_id uuid)
RETURNS TABLE (locked_until bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner', 'app_pre_session', 'pre_session', 'auth.email-otp.lock.read',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg]),
    'app.email_auth_find_email_otp_lock(uuid)'::regprocedure
  );
  RETURN QUERY SELECT l.locked_until FROM public.email_otp_locks l WHERE l.user_id = p_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.email_auth_register_email_otp_lockout(p_user_id uuid)
RETURNS TABLE (locked_until bigint)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner', 'app_pre_session', 'pre_session', 'auth.email-otp.lock.register',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg]),
    'app.email_auth_register_email_otp_lockout(uuid)'::regprocedure
  );
  RETURN QUERY
  INSERT INTO public.email_otp_locks (user_id, lockout_cycle, locked_until)
  VALUES (p_user_id, 1, extract(epoch FROM clock_timestamp())::bigint + 120)
  ON CONFLICT (user_id) DO UPDATE SET
    lockout_cycle = email_otp_locks.lockout_cycle + 1,
    locked_until = extract(epoch FROM clock_timestamp())::bigint
      + LEAST(1800, (120 * power(2, LEAST(email_otp_locks.lockout_cycle, 10)))::bigint)
  RETURNING email_otp_locks.locked_until;
END
$function$;

CREATE OR REPLACE FUNCTION app.email_auth_reset_email_otp_lockout(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner', 'app_pre_session', 'pre_session', 'auth.email-otp.lock.reset',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg]),
    'app.email_auth_reset_email_otp_lockout(uuid)'::regprocedure
  );
  DELETE FROM public.email_otp_locks WHERE user_id = p_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_auth_find_otp_lock(p_phone text)
RETURNS TABLE (locked_until bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-otp.lock.read',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_phone))::app.port_typed_arg]),
    'app.phone_auth_find_otp_lock(text)'::regprocedure
  );
  RETURN QUERY SELECT l.locked_until FROM public.phone_otp_locks l WHERE l.phone_normalized = p_phone;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_auth_find_latest_challenge_created_at(p_phone text)
RETURNS TABLE (max_created timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-otp.cooldown.read',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_phone))::app.port_typed_arg]),
    'app.phone_auth_find_latest_challenge_created_at(text)'::regprocedure
  );
  RETURN QUERY SELECT max(c.created_at) FROM public.phone_challenges c WHERE c.phone = p_phone;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_auth_register_otp_lockout(p_phone text, p_now_sec bigint)
RETURNS TABLE (locked_until bigint)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-otp.lock.register',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_phone))::app.port_typed_arg,
      ROW('bigint@1', int8send(p_now_sec))::app.port_typed_arg
    ]), 'app.phone_auth_register_otp_lockout(text,bigint)'::regprocedure
  );
  RETURN QUERY
  INSERT INTO public.phone_otp_locks (phone_normalized, lockout_cycle, locked_until)
  VALUES (p_phone, 1, p_now_sec + 120)
  ON CONFLICT (phone_normalized) DO UPDATE SET
    lockout_cycle = phone_otp_locks.lockout_cycle + 1,
    locked_until = p_now_sec + LEAST(1800, (120 * power(2, LEAST(phone_otp_locks.lockout_cycle, 10)))::bigint)
  RETURNING phone_otp_locks.locked_until;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_auth_reset_otp_lockout(p_phone text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-otp.lock.reset',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_phone))::app.port_typed_arg]),
    'app.phone_auth_reset_otp_lockout(text)'::regprocedure
  );
  DELETE FROM public.phone_otp_locks l WHERE l.phone_normalized = p_phone;
END
$function$;

DROP FUNCTION IF EXISTS app.phone_challenge_store_upsert(text,text,bigint,text,jsonb,integer);
CREATE OR REPLACE FUNCTION app.phone_challenge_store_upsert(
  p_challenge_id text, p_phone text, p_expires_at bigint, p_code text,
  p_channel_context text, p_verify_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-challenge.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_phone))::app.port_typed_arg,
      ROW('bigint@1', int8send(p_expires_at))::app.port_typed_arg,
      ROW('text@1', textsend(p_code))::app.port_typed_arg,
      ROW('text@1', textsend(p_channel_context))::app.port_typed_arg,
      ROW('integer@1', int4send(p_verify_attempts))::app.port_typed_arg
    ]), 'app.phone_challenge_store_upsert(text,text,bigint,text,text,integer)'::regprocedure
  );
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' OR p_phone IS NULL OR btrim(p_phone) = ''
     OR p_expires_at IS NULL OR p_expires_at <= 0 OR p_verify_attempts IS NULL OR p_verify_attempts < 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.phone_challenges AS c
    (challenge_id, phone, expires_at, code, channel_context, verify_attempts)
  VALUES (p_challenge_id, p_phone, p_expires_at, p_code, p_channel_context::jsonb, p_verify_attempts)
  ON CONFLICT (challenge_id) DO UPDATE SET phone = EXCLUDED.phone, expires_at = EXCLUDED.expires_at,
    code = EXCLUDED.code, channel_context = EXCLUDED.channel_context, verify_attempts = EXCLUDED.verify_attempts
  WHERE c.phone = EXCLUDED.phone;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_read(p_challenge_id text)
RETURNS TABLE (phone text, expires_at bigint, code text, channel_context jsonb, verify_attempts integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_challenge public.phone_challenges%ROWTYPE; v_now_sec bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-challenge.read',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg]),
    'app.phone_challenge_store_read(text)'::regprocedure
  );
  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN; END IF;
  SELECT c.* INTO v_challenge FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
    RETURN;
  END IF;
  RETURN QUERY SELECT v_challenge.phone, v_challenge.expires_at, v_challenge.code,
    v_challenge.channel_context, v_challenge.verify_attempts::integer;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_delete(p_challenge_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-challenge.delete',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg]),
    'app.phone_challenge_store_delete(text)'::regprocedure
  );
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN false; END IF;
  DELETE FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_delete_by_phone(p_phone text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-challenge.delete-by-phone',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_phone))::app.port_typed_arg]),
    'app.phone_challenge_store_delete_by_phone(text)'::regprocedure
  );
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RETURN 0; END IF;
  DELETE FROM public.phone_challenges c WHERE c.phone = p_phone;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_challenge_store_increment_attempts(p_challenge_id text, p_now_sec bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_attempts integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'auth.phone-challenge.attempt.increment',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg,
      ROW('bigint@1', int8send(p_now_sec))::app.port_typed_arg
    ]), 'app.phone_challenge_store_increment_attempts(text,bigint)'::regprocedure
  );
  UPDATE public.phone_challenges c SET verify_attempts = c.verify_attempts + 1
   WHERE c.challenge_id = p_challenge_id AND c.expires_at > p_now_sec
   RETURNING c.verify_attempts::integer INTO v_attempts;
  RETURN v_attempts;
END
$function$;

DROP FUNCTION IF EXISTS app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,jsonb);
CREATE OR REPLACE FUNCTION app.phone_otp_public_booking_issue_challenge(
  p_phone text, p_challenge_id text, p_code text, p_ttl_sec integer,
  p_resend_cooldown_sec integer, p_delivery_channel text, p_intent text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_now_sec bigint;
  v_locked_until bigint;
  v_last_created timestamptz;
  v_intent jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'booking.public-phone-otp.issue',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_phone))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_code))::app.port_typed_arg,
      ROW('integer@1', int4send(p_ttl_sec))::app.port_typed_arg,
      ROW('integer@1', int4send(p_resend_cooldown_sec))::app.port_typed_arg,
      ROW('text@1', textsend(p_delivery_channel))::app.port_typed_arg,
      ROW('text@1', textsend(p_intent))::app.port_typed_arg
    ]), 'app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)'::regprocedure
  );
  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  v_intent := p_intent::jsonb;
  IF p_phone IS NULL OR btrim(p_phone) = '' OR p_challenge_id IS NULL OR btrim(p_challenge_id) = ''
     OR p_code IS NULL OR btrim(p_code) = '' OR p_ttl_sec IS NULL OR p_ttl_sec <= 0
     OR p_resend_cooldown_sec IS NULL OR p_resend_cooldown_sec < 0
     OR p_delivery_channel IS NULL OR btrim(p_delivery_channel) = ''
     OR v_intent IS NULL OR jsonb_typeof(v_intent) <> 'object' THEN RETURN false; END IF;
  DELETE FROM public.phone_otp_locks WHERE locked_until <= v_now_sec;
  SELECT l.locked_until INTO v_locked_until FROM public.phone_otp_locks l
   WHERE l.phone_normalized = p_phone FOR UPDATE;
  IF FOUND AND v_locked_until > v_now_sec THEN RETURN false; END IF;
  SELECT max(c.created_at) INTO v_last_created FROM public.phone_challenges c WHERE c.phone = p_phone;
  IF v_last_created IS NOT NULL
     AND extract(epoch FROM (clock_timestamp() - v_last_created)) < p_resend_cooldown_sec THEN
    RETURN false;
  END IF;
  DELETE FROM public.phone_challenges WHERE phone = p_phone;
  INSERT INTO public.phone_challenges
    (challenge_id, phone, expires_at, code, channel_context, verify_attempts)
  VALUES (p_challenge_id, p_phone, v_now_sec + p_ttl_sec, p_code,
    jsonb_build_object('otpDelivery', p_delivery_channel, 'publicBookingIntent', v_intent), 0)
  ON CONFLICT (challenge_id) DO NOTHING;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.phone_otp_public_booking_consume_challenge(
  p_challenge_id text, p_code text, p_max_attempts integer, p_lock_duration_sec integer
)
RETURNS TABLE (ok boolean, intent jsonb, delivery_channel text, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_now_sec bigint;
  v_challenge public.phone_challenges%ROWTYPE;
  v_intent jsonb;
  v_next_attempts integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_otp_owner', 'app_pre_session', 'pre_session', 'booking.public-phone-otp.consume',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_challenge_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_code))::app.port_typed_arg,
      ROW('integer@1', int4send(p_max_attempts))::app.port_typed_arg,
      ROW('integer@1', int4send(p_lock_duration_sec))::app.port_typed_arg
    ]), 'app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)'::regprocedure
  );
  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' OR p_code IS NULL OR btrim(p_code) = ''
     OR p_max_attempts IS NULL OR p_max_attempts <= 0
     OR p_lock_duration_sec IS NULL OR p_lock_duration_sec < 0 THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  SELECT c.* INTO v_challenge FROM public.phone_challenges c
   WHERE c.challenge_id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN; END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  v_intent := v_challenge.channel_context -> 'publicBookingIntent';
  IF v_intent IS NULL OR jsonb_typeof(v_intent) <> 'object' THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  IF v_challenge.code IS NULL OR v_challenge.code <> p_code THEN
    UPDATE public.phone_challenges SET verify_attempts = verify_attempts + 1
     WHERE challenge_id = p_challenge_id RETURNING verify_attempts::integer INTO v_next_attempts;
    IF v_next_attempts >= p_max_attempts THEN
      DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
      INSERT INTO public.phone_otp_locks (phone_normalized, locked_until)
      VALUES (v_challenge.phone, v_now_sec + p_lock_duration_sec)
      ON CONFLICT (phone_normalized) DO UPDATE SET locked_until = EXCLUDED.locked_until;
      RETURN QUERY SELECT false, NULL::jsonb, NULL::text, p_lock_duration_sec; RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
  RETURN QUERY SELECT true, v_intent, v_challenge.channel_context ->> 'otpDelivery', NULL::integer;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_oauth_list_user_providers(p_user_id uuid)
RETURNS TABLE (provider text)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_oauth_owner', 'app_worker', 'service', 'relation',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), NULL::regprocedure
  );
  RETURN QUERY SELECT DISTINCT b.provider FROM public.user_oauth_bindings b
   WHERE p_user_id IS NOT NULL AND b.user_id = p_user_id
     AND b.provider IN ('google', 'apple', 'yandex', 'vk');
END
$function$;

DO $ownership$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('app.read_integrator_migration_ledger()', 'app_seam_catalog_admin_owner'),
    ('app.read_patient_telegram_display_handle(uuid)', 'app_seam_delivery_scope_owner'),
    ('app.read_canonical_appointment_by_external_id(text)', 'app_seam_patient_booking_owner'),
    ('app.list_active_canonical_appointments_by_phone(text)', 'app_seam_patient_booking_owner'),
    ('app.count_active_canonical_appointments()', 'app_seam_patient_booking_owner'),
    ('app.try_acquire_integrator_idempotency(text,integer)', 'app_seam_delivery_scope_owner'),
    ('app.release_integrator_idempotency(text)', 'app_seam_delivery_scope_owner'),
    ('app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)', 'app_seam_delivery_scope_owner'),
    ('app.get_google_calendar_event_id(uuid)', 'app_seam_patient_booking_owner'),
    ('app.upsert_google_calendar_event_id(uuid,text)', 'app_seam_patient_booking_owner'),
    ('app.delete_google_calendar_event_id(uuid)', 'app_seam_patient_booking_owner'),
    ('app.read_booking_calendar_patient_profile(uuid)', 'app_seam_patient_booking_owner'),
    ('app.read_booking_calendar_latest_staff_comment(uuid)', 'app_seam_patient_booking_owner'),
    ('app.is_current_patient_self_booking_allowed()', 'app_seam_patient_booking_owner'),
    ('app.email_auth_find_email_otp_lock(uuid)', 'app_seam_email_otp_owner'),
    ('app.email_auth_register_email_otp_lockout(uuid)', 'app_seam_email_otp_owner'),
    ('app.email_auth_reset_email_otp_lockout(uuid)', 'app_seam_email_otp_owner'),
    ('app.phone_auth_find_otp_lock(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_auth_find_latest_challenge_created_at(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_auth_register_otp_lockout(text,bigint)', 'app_seam_phone_otp_owner'),
    ('app.phone_auth_reset_otp_lockout(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_challenge_store_upsert(text,text,bigint,text,text,integer)', 'app_seam_phone_otp_owner'),
    ('app.phone_challenge_store_read(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_challenge_store_delete(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_challenge_store_delete_by_phone(text)', 'app_seam_phone_otp_owner'),
    ('app.phone_challenge_store_increment_attempts(text,bigint)', 'app_seam_phone_otp_owner'),
    ('app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)', 'app_seam_phone_otp_owner'),
    ('app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)', 'app_seam_phone_otp_owner'),
    ('app.password_login_acquire(text,text,uuid,text)', 'app_seam_password_auth_owner'),
    ('app.password_login_complete(uuid,boolean)', 'app_seam_password_auth_owner'),
    ('app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)', 'app_seam_password_auth_owner'),
    ('app.password_login_read_altcha_secret()', 'app_seam_password_auth_owner'),
    ('app.auth_oauth_list_user_providers(uuid)', 'app_seam_oauth_owner')
  ) AS rows(signature, owner_name) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', item.signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = item.owner_name) THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO %I', item.signature, item.owner_name);
    END IF;
  END LOOP;
END
$ownership$;
