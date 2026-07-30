-- 0274: atomic password-proof admission and single-use ALTCHA (#1065).
--
-- Password verification is deliberately split into:
--   acquire (one serialized lease before Argon2) -> Argon2 outside SQL -> complete (exact lease).
-- Identifier and account state are updated in one transaction.  Runtime roles receive only the
-- narrow functions below; the protection/challenge tables have no direct runtime grants.

ALTER TABLE public.user_password_credentials
  ADD COLUMN IF NOT EXISTS next_allowed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_lease_token uuid,
  ADD COLUMN IF NOT EXISTS verification_lease_until timestamptz;

-- 0266 temporarily coupled generic rate-limit events to password state. Password state now has one
-- writer only (acquire/complete/reset), so restore the canonical 0254 INSERT-only function.
CREATE OR REPLACE FUNCTION app.auth_rate_limit_record(
  p_scope text,
  p_key text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.auth_rate_limit_events (scope, key, occurred_at)
  VALUES (p_scope, p_key, now())
$function$;

COMMENT ON FUNCTION app.auth_rate_limit_record(text, text) IS
  'Sliding-window record: inserts one current-time event for the exact supplied scope/key.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_password_credentials_verification_lease_token
  ON public.user_password_credentials (verification_lease_token)
  WHERE verification_lease_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_password_credentials_verification_lease_until
  ON public.user_password_credentials (verification_lease_until)
  WHERE verification_lease_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.password_login_identifier_protection (
  identifier_key text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  next_allowed_at timestamptz,
  locked_until timestamptz,
  verification_lease_token uuid,
  verification_lease_until timestamptz,
  leased_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT password_login_identifier_key_check
    CHECK (identifier_key ~ '^password-email:v1:[0-9a-f]{64}$'),
  CONSTRAINT password_login_identifier_failed_attempts_check CHECK (failed_attempts >= 0),
  CONSTRAINT password_login_identifier_lease_shape_check CHECK (
    (verification_lease_token IS NULL AND verification_lease_until IS NULL AND leased_user_id IS NULL)
    OR (verification_lease_token IS NOT NULL AND verification_lease_until IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_login_identifier_verification_lease_token
  ON public.password_login_identifier_protection (verification_lease_token)
  WHERE verification_lease_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_login_identifier_verification_lease_until
  ON public.password_login_identifier_protection (verification_lease_until)
  WHERE verification_lease_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_login_identifier_locked_until
  ON public.password_login_identifier_protection (locked_until)
  WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_login_identifier_updated_at
  ON public.password_login_identifier_protection (updated_at);

CREATE TABLE IF NOT EXISTS public.password_altcha_challenges (
  challenge_id uuid PRIMARY KEY,
  identifier_key text NOT NULL,
  purpose text NOT NULL,
  challenge_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT password_altcha_challenge_identifier_key_check
    CHECK (identifier_key ~ '^password-email:v1:[0-9a-f]{64}$'),
  CONSTRAINT password_altcha_challenge_purpose_check CHECK (purpose = 'password_login'),
  CONSTRAINT password_altcha_challenge_digest_check CHECK (
    challenge_digest ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_password_altcha_challenges_identifier_expiry
  ON public.password_altcha_challenges (identifier_key, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_altcha_challenges_expiry
  ON public.password_altcha_challenges (expires_at);

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
SELECT
  'auth_altcha_hmac_secret',
  'admin',
  NULL,
  jsonb_build_object(
    'value',
    encode(app_ext.gen_random_bytes(32), 'hex')
  ),
  statement_timestamp()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings
  WHERE key = 'auth_altcha_hmac_secret'
    AND scope = 'admin'
    AND organization_id IS NULL
);

CREATE OR REPLACE FUNCTION app.password_login_read_altcha_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(settings.value_json ->> 'value', '')
  FROM public.system_settings AS settings
  WHERE settings.key = 'auth_altcha_hmac_secret'
    AND settings.scope = 'admin'
    AND settings.organization_id IS NULL
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.password_login_issue_altcha_challenge(
  p_email_normalized text,
  p_challenge_id uuid,
  p_challenge_digest text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_state public.password_login_identifier_protection%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_live_count integer;
  v_identifier_key text;
  v_account_attempts integer := 0;
  v_account_locked_until timestamptz;
BEGIN
  IF p_email_normalized IS NULL
    OR length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR lower(btrim(p_email_normalized)) IS DISTINCT FROM p_email_normalized
    OR p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR p_challenge_id IS NULL
    OR p_challenge_digest IS NULL
    OR p_challenge_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RETURN false;
  END IF;

  v_identifier_key :=
    'password-email:v1:' || encode(app_ext.digest(p_email_normalized, 'sha256'), 'hex');

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  SELECT state.*
  INTO v_state
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  SELECT credentials.failed_attempts, credentials.locked_until
  INTO v_account_attempts, v_account_locked_until
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  WHERE users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE OF credentials;

  IF (v_state.locked_until IS NOT NULL AND v_state.locked_until > v_now)
    OR (v_account_locked_until IS NOT NULL AND v_account_locked_until > v_now)
  THEN
    RETURN false;
  END IF;
  IF greatest(v_state.failed_attempts, coalesce(v_account_attempts, 0)) < 5 THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_live_count
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.identifier_key = v_identifier_key
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at > v_now;

  IF v_live_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_altcha_challenges (
    challenge_id,
    identifier_key,
    purpose,
    challenge_digest,
    expires_at
  )
  VALUES (
    p_challenge_id,
    v_identifier_key,
    'password_login',
    p_challenge_digest,
    p_expires_at
  );

  RETURN true;
END
$function$;

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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_identifier public.password_login_identifier_protection%ROWTYPE;
  v_credential public.user_password_credentials%ROWTYPE;
  v_user_id uuid;
  v_email_verified boolean;
  v_attempts integer;
  v_locked_until timestamptz;
  v_next_allowed_at timestamptz;
  v_lease_until timestamptz;
  v_challenge public.password_altcha_challenges%ROWTYPE;
  v_expected_identifier_key text;
BEGIN
  IF p_email_normalized IS NULL
    OR length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR lower(btrim(p_email_normalized)) IS DISTINCT FROM p_email_normalized
    OR p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR p_identifier_key IS NULL
    OR length(p_identifier_key) <> 82
    OR p_identifier_key !~ '^password-email:v1:[0-9a-f]{64}$'
  THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, false;
    RETURN;
  END IF;

  v_expected_identifier_key :=
    'password-email:v1:' || encode(app_ext.digest(p_email_normalized, 'sha256'), 'hex');
  IF p_identifier_key IS DISTINCT FROM v_expected_identifier_key THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, false;
    RETURN;
  END IF;

  -- Public identifiers are attacker-controlled. One concurrent caller performs two bounded,
  -- skip-locked retention batches; challenges survive through expiry and active protection state
  -- is never pruned.
  IF pg_try_advisory_xact_lock(
    hashtextextended('password_login_retention_v1', 0)
  ) THEN
    WITH expired AS (
      SELECT challenge.ctid
      FROM public.password_altcha_challenges AS challenge
      WHERE challenge.expires_at <= v_now
      ORDER BY challenge.expires_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.password_altcha_challenges AS challenge
    USING expired
    WHERE challenge.ctid = expired.ctid;

    WITH stale AS (
      SELECT state.ctid
      FROM public.password_login_identifier_protection AS state
      WHERE state.updated_at < v_now - interval '30 days'
        AND (state.next_allowed_at IS NULL OR state.next_allowed_at <= v_now)
        AND (state.locked_until IS NULL OR state.locked_until <= v_now)
        AND (state.verification_lease_until IS NULL OR state.verification_lease_until <= v_now)
        AND NOT EXISTS (
          SELECT 1
          FROM public.password_altcha_challenges AS challenge
          WHERE challenge.identifier_key = state.identifier_key
            AND challenge.expires_at > v_now
        )
      ORDER BY state.updated_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.password_login_identifier_protection AS state
    USING stale
    WHERE state.ctid = stale.ctid;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (p_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  -- Identifier is always locked first; complete/reset use the same order.
  SELECT state.*
  INTO v_identifier
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = p_identifier_key
  FOR UPDATE;

  SELECT credentials.user_id, users.email_verified_at IS NOT NULL
  INTO v_user_id, v_email_verified
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  WHERE users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT credentials.*
    INTO v_credential
    FROM public.user_password_credentials AS credentials
    WHERE credentials.user_id = v_user_id
    FOR UPDATE;
  END IF;

  IF v_identifier.locked_until IS NOT NULL AND v_identifier.locked_until <= v_now THEN
    UPDATE public.password_login_identifier_protection AS state
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL,
        leased_user_id = NULL,
        updated_at = v_now
    WHERE state.identifier_key = p_identifier_key;
    v_identifier.failed_attempts := 0;
    v_identifier.next_allowed_at := NULL;
    v_identifier.locked_until := NULL;
    v_identifier.verification_lease_token := NULL;
    v_identifier.verification_lease_until := NULL;
  END IF;

  IF v_user_id IS NOT NULL
    AND v_credential.locked_until IS NOT NULL
    AND v_credential.locked_until <= v_now
  THEN
    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_user_id;
    v_credential.failed_attempts := 0;
    v_credential.next_allowed_at := NULL;
    v_credential.locked_until := NULL;
    v_credential.verification_lease_token := NULL;
    v_credential.verification_lease_until := NULL;
  END IF;

  v_attempts := greatest(
    v_identifier.failed_attempts,
    coalesce(v_credential.failed_attempts, 0)
  );
  v_locked_until := greatest(v_identifier.locked_until, v_credential.locked_until);
  v_next_allowed_at := greatest(v_identifier.next_allowed_at, v_credential.next_allowed_at);
  v_lease_until := greatest(
    v_identifier.verification_lease_until,
    v_credential.verification_lease_until
  );

  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT
      'locked'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      greatest(1, ceil(extract(epoch FROM v_locked_until - v_now))::integer),
      true;
    RETURN;
  END IF;

  IF v_next_allowed_at IS NOT NULL AND v_next_allowed_at > v_now THEN
    RETURN QUERY SELECT
      'cooldown'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      greatest(1, ceil(extract(epoch FROM v_next_allowed_at - v_now))::integer),
      v_attempts >= 5;
    RETURN;
  END IF;

  IF v_lease_until IS NOT NULL AND v_lease_until > v_now THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::text, NULL::uuid, false, 1, v_attempts >= 5;
    RETURN;
  END IF;

  IF v_attempts >= 5 THEN
    IF p_altcha_challenge_id IS NULL OR p_altcha_challenge_digest IS NULL THEN
      RETURN QUERY SELECT 'challenge_required'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, true;
      RETURN;
    END IF;

    SELECT challenge.*
    INTO v_challenge
    FROM public.password_altcha_challenges AS challenge
    WHERE challenge.challenge_id = p_altcha_challenge_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_challenge.identifier_key IS DISTINCT FROM p_identifier_key
      OR v_challenge.purpose IS DISTINCT FROM 'password_login'
      OR v_challenge.challenge_digest IS DISTINCT FROM p_altcha_challenge_digest
      OR v_challenge.expires_at <= v_now
      OR v_challenge.consumed_at IS NOT NULL
    THEN
      RETURN QUERY SELECT 'challenge_required'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, true;
      RETURN;
    END IF;

    UPDATE public.password_altcha_challenges AS challenge
    SET consumed_at = v_now
    WHERE challenge.challenge_id = p_altcha_challenge_id;
  END IF;

  lease_token := gen_random_uuid();
  v_lease_until := v_now + interval '30 seconds';

  UPDATE public.password_login_identifier_protection AS state
  SET verification_lease_token = lease_token,
      verification_lease_until = v_lease_until,
      leased_user_id = v_user_id,
      updated_at = v_now
  WHERE state.identifier_key = p_identifier_key;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.user_password_credentials AS credentials
    SET verification_lease_token = lease_token,
        verification_lease_until = v_lease_until
    WHERE credentials.user_id = v_user_id;
  END IF;

  RETURN QUERY SELECT
    'acquired'::text,
    lease_token,
    coalesce(v_credential.password_hash, NULL::text),
    v_user_id,
    coalesce(v_email_verified, false),
    0,
    v_attempts >= 5;
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_identifier public.password_login_identifier_protection%ROWTYPE;
  v_credential public.user_password_credentials%ROWTYPE;
  v_email_verified boolean := false;
  v_attempts integer;
  v_next_allowed_at timestamptz;
  v_locked_until timestamptz;
BEGIN
  SELECT state.*
  INTO v_identifier
  FROM public.password_login_identifier_protection AS state
  WHERE state.verification_lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND
    OR v_identifier.verification_lease_until IS NULL
    OR v_identifier.verification_lease_until <= v_now
  THEN
    RETURN QUERY SELECT false, false, NULL::uuid, false, 0, 0, false;
    RETURN;
  END IF;

  IF v_identifier.leased_user_id IS NOT NULL THEN
    SELECT credentials.*
    INTO v_credential
    FROM public.user_password_credentials AS credentials
    WHERE credentials.user_id = v_identifier.leased_user_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_credential.verification_lease_token IS DISTINCT FROM p_lease_token
      OR v_credential.verification_lease_until IS NULL
      OR v_credential.verification_lease_until <= v_now
    THEN
      RETURN QUERY SELECT false, false, NULL::uuid, false, 0, 0, false;
      RETURN;
    END IF;

    SELECT users.email_verified_at IS NOT NULL
    INTO v_email_verified
    FROM public.platform_users AS users
    WHERE users.id = v_identifier.leased_user_id
      AND users.merged_into_id IS NULL;
  END IF;

  IF p_password_verified AND v_identifier.leased_user_id IS NOT NULL THEN
    UPDATE public.password_login_identifier_protection AS state
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL,
        leased_user_id = NULL,
        updated_at = v_now
    WHERE state.identifier_key = v_identifier.identifier_key;

    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_identifier.leased_user_id;

    RETURN QUERY SELECT
      true,
      true,
      v_identifier.leased_user_id,
      coalesce(v_email_verified, false),
      0,
      0,
      false;
    RETURN;
  END IF;

  v_attempts := greatest(
    v_identifier.failed_attempts,
    coalesce(v_credential.failed_attempts, 0)
  ) + 1;
  v_next_allowed_at := CASE
    WHEN v_attempts BETWEEN 5 AND 9
      THEN v_now + make_interval(secs => (30 * power(2, v_attempts - 5))::double precision)
    ELSE NULL
  END;
  v_locked_until := CASE
    WHEN v_attempts >= 10 THEN v_now + interval '15 minutes'
    ELSE NULL
  END;

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = least(v_attempts, 10),
      next_allowed_at = v_next_allowed_at,
      locked_until = v_locked_until,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = v_now
  WHERE state.identifier_key = v_identifier.identifier_key;

  IF v_identifier.leased_user_id IS NOT NULL THEN
    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = least(v_attempts, 10),
        next_allowed_at = v_next_allowed_at,
        locked_until = v_locked_until,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_identifier.leased_user_id;
  END IF;

  RETURN QUERY SELECT
    true,
    false,
    NULL::uuid,
    false,
    least(v_attempts, 10),
    CASE
      WHEN v_locked_until IS NOT NULL THEN 900
      WHEN v_next_allowed_at IS NOT NULL
        THEN greatest(1, ceil(extract(epoch FROM v_next_allowed_at - v_now))::integer)
      ELSE 0
    END,
    v_attempts >= 5;
END
$function$;

CREATE OR REPLACE FUNCTION app.password_credentials_replace_self(
  p_email_normalized text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  SELECT 'password-email:v1:' || encode(app_ext.digest(users.email_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  WHERE users.id = v_user_id
    AND users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  -- Keep the same identifier-first order used by acquire/complete.
  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = p_password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      updated_at = statement_timestamp()
  WHERE credentials.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.password_credentials_upsert_self(
  p_email_normalized text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  SELECT 'password-email:v1:' || encode(app_ext.digest(users.email_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  WHERE users.id = v_user_id
    AND users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  INSERT INTO public.user_password_credentials (
    user_id,
    password_hash,
    failed_attempts,
    next_allowed_at,
    locked_until,
    verification_lease_token,
    verification_lease_until,
    updated_at
  )
  VALUES (
    v_user_id,
    p_password_hash,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    statement_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      updated_at = statement_timestamp();

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$function$;

COMMENT ON FUNCTION app.password_login_acquire(text, text, uuid, text) IS
  'Atomically gates one account+identifier (or unknown identifier) password proof and creates a 30-second lease.';
COMMENT ON FUNCTION app.password_login_complete(uuid, boolean) IS
  'Completes only the exact unexpired password-proof lease; stale/taken-over completions are rejected.';
COMMENT ON FUNCTION app.password_login_issue_altcha_challenge(text, uuid, text, timestamptz) IS
  'Registers a bounded single-use ALTCHA challenge only after five password failures.';
COMMENT ON FUNCTION app.password_login_read_altcha_secret() IS
  'Fixed-key accessor for the server-only ALTCHA HMAC root stored in system_settings.';

DO $ownership$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- Public tables keep the canonical database-owner ownership used by the rest of the webapp
    -- schema. app_owner deliberately has no CREATE on public, so transferring ownership would make
    -- this migration fail with 42501. Grant only the DML required by the SECURITY DEFINER functions.
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.password_login_identifier_protection,
               public.password_altcha_challenges
      TO app_owner;
    ALTER FUNCTION app.password_login_read_altcha_secret() OWNER TO app_owner;
    ALTER FUNCTION app.password_login_issue_altcha_challenge(text, uuid, text, timestamptz)
      OWNER TO app_owner;
    ALTER FUNCTION app.password_login_acquire(text, text, uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.password_login_complete(uuid, boolean) OWNER TO app_owner;
    ALTER FUNCTION app.password_credentials_replace_self(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.password_credentials_upsert_self(text, text) OWNER TO app_owner;
  END IF;
END
$ownership$;

REVOKE ALL ON TABLE public.password_login_identifier_protection FROM PUBLIC;
REVOKE ALL ON TABLE public.password_altcha_challenges FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_login_read_altcha_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_login_issue_altcha_challenge(text, uuid, text, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_login_acquire(text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_login_complete(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_credentials_replace_self(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_credentials_upsert_self(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.set_staff_security_self_password_hash(text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    REVOKE ALL ON TABLE public.password_login_identifier_protection FROM app_patient;
    REVOKE ALL ON TABLE public.password_altcha_challenges FROM app_patient;
    REVOKE EXECUTE ON FUNCTION app.set_staff_security_self_password_hash(text) FROM app_patient;
    GRANT EXECUTE ON FUNCTION app.password_credentials_replace_self(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.password_credentials_upsert_self(text, text) TO app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    REVOKE ALL ON TABLE public.password_login_identifier_protection FROM app_staff;
    REVOKE ALL ON TABLE public.password_altcha_challenges FROM app_staff;
    REVOKE EXECUTE ON FUNCTION app.set_staff_security_self_password_hash(text) FROM app_staff;
  END IF;
END
$grants$;
