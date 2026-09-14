-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'auth_captcha_enabled' AND scope = 'admin' AND organization_id IS NULL AND value_json = '{"value":false}'::jsonb) AND EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'auth_captcha_from_attempt' AND scope = 'admin' AND organization_id IS NULL AND value_json = '{"value":3}'::jsonb)
INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES
  ('auth_captcha_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_captcha_from_attempt', 'admin', NULL, '{"value":3}'::jsonb, statement_timestamp(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'auth_captcha_enabled') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.password_login_acquire_impl(text,text,uuid,text)')
CREATE OR REPLACE FUNCTION app.password_login_acquire_impl(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid DEFAULT NULL::uuid, p_altcha_challenge_digest text DEFAULT NULL::text)
 RETURNS TABLE(status text, lease_token uuid, password_hash text, user_id uuid, email_verified boolean, retry_after_seconds integer, captcha_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
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
  v_captcha_enabled boolean := false;
  v_captcha_from integer := 3;
BEGIN
  WITH policy AS (
    SELECT
      coalesce(bool_or(
        settings.key = 'auth_captcha_enabled'
        AND settings.value_json -> 'value' = 'true'::jsonb
      ), false) AS enabled,
      coalesce(bool_or(
        settings.key = 'auth_altcha_hmac_secret'
        AND nullif(btrim(settings.value_json ->> 'value'), '') IS NOT NULL
      ), false) AS has_secret,
      max(
        CASE
          WHEN settings.key = 'auth_captcha_from_attempt'
            AND btrim(settings.value_json ->> 'value') ~ '^[+-]?[0-9]+$'
          THEN greatest(
            1::numeric,
            least(50::numeric, btrim(settings.value_json ->> 'value')::numeric)
          )::integer
          ELSE NULL
        END
      ) AS from_attempt
    FROM public.system_settings AS settings
    WHERE settings.scope = 'admin'
      AND settings.organization_id IS NULL
      AND settings.key IN (
        'auth_captcha_enabled',
        'auth_captcha_from_attempt',
        'auth_altcha_hmac_secret'
      )
  )
  SELECT
    -- A blank secret disables captcha so login never demands a challenge that cannot be issued.
    -- `auth_captcha_from_attempt` is the ATTEMPT NUMBER that first carries a captcha, which is the
    -- admin's own reading of the field (owner, 14.09). `v_attempts` counts failures already made,
    -- so the third attempt is guarded once two failures stand: hence `>= v_captcha_from - 1`.
    policy.enabled AND policy.has_secret,
    coalesce(policy.from_attempt, 3)
  INTO v_captcha_enabled, v_captcha_from
  FROM policy;

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

  SELECT credentials.user_id, contact.confirmed_at IS NOT NULL
  INTO v_user_id, v_email_verified
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
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
      v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0);
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
      v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0);
    RETURN;
  END IF;

  IF v_lease_until IS NOT NULL AND v_lease_until > v_now THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::text, NULL::uuid, false, 1,
      v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0);
    RETURN;
  END IF;

  IF v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0) THEN
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
    v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'auth_captcha_enabled') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.password_login_complete_impl(uuid,boolean)')
CREATE OR REPLACE FUNCTION app.password_login_complete_impl(p_lease_token uuid, p_password_verified boolean)
 RETURNS TABLE(accepted boolean, succeeded boolean, user_id uuid, email_verified boolean, attempts integer, retry_after_seconds integer, captcha_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_identifier public.password_login_identifier_protection%ROWTYPE;
  v_credential public.user_password_credentials%ROWTYPE;
  v_email_verified boolean := false;
  v_attempts integer;
  v_next_allowed_at timestamptz;
  v_locked_until timestamptz;
  v_captcha_enabled boolean := false;
  v_captcha_from integer := 3;
BEGIN
  WITH policy AS (
    SELECT
      coalesce(bool_or(
        settings.key = 'auth_captcha_enabled'
        AND settings.value_json -> 'value' = 'true'::jsonb
      ), false) AS enabled,
      coalesce(bool_or(
        settings.key = 'auth_altcha_hmac_secret'
        AND nullif(btrim(settings.value_json ->> 'value'), '') IS NOT NULL
      ), false) AS has_secret,
      max(
        CASE
          WHEN settings.key = 'auth_captcha_from_attempt'
            AND btrim(settings.value_json ->> 'value') ~ '^[+-]?[0-9]+$'
          THEN greatest(
            1::numeric,
            least(50::numeric, btrim(settings.value_json ->> 'value')::numeric)
          )::integer
          ELSE NULL
        END
      ) AS from_attempt
    FROM public.system_settings AS settings
    WHERE settings.scope = 'admin'
      AND settings.organization_id IS NULL
      AND settings.key IN (
        'auth_captcha_enabled',
        'auth_captcha_from_attempt',
        'auth_altcha_hmac_secret'
      )
  )
  SELECT
    -- A blank secret disables captcha so login never demands a challenge that cannot be issued.
    -- `auth_captcha_from_attempt` is the ATTEMPT NUMBER that first carries a captcha, which is the
    -- admin's own reading of the field (owner, 14.09). `v_attempts` counts failures already made,
    -- so the third attempt is guarded once two failures stand: hence `>= v_captcha_from - 1`.
    policy.enabled AND policy.has_secret,
    coalesce(policy.from_attempt, 3)
  INTO v_captcha_enabled, v_captcha_from
  FROM policy;

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

    SELECT EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = users.id
        AND contact.contact_kind = 'email'
        AND contact.confirmed_at IS NOT NULL
    )
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
    v_captcha_enabled AND v_attempts >= greatest(v_captcha_from - 1, 0);
END
$function$;
