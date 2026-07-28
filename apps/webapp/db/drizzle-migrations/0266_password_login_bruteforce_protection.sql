-- 0265: password brute-force protection (#1065 / OWNER_PUNCHLIST §3.1, §3.3).
--
-- The canonical consecutive-failure state lives on user_password_credentials. The existing
-- auth_rate_limit_events accessors additionally keep pseudonymous identifier timing indistinguishable
-- when no account exists. Existing functions and grants are reused; this migration adds no role grant
-- and changes no RLS policy.

ALTER TABLE public.user_password_credentials
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

DO $password_failed_attempts_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_password_credentials_failed_attempts_check'
      AND conrelid = 'public.user_password_credentials'::regclass
  ) THEN
    ALTER TABLE public.user_password_credentials
      ADD CONSTRAINT user_password_credentials_failed_attempts_check
      CHECK (failed_attempts >= 0);
  END IF;
END
$password_failed_attempts_check$;

CREATE OR REPLACE FUNCTION app.auth_rate_limit_record(
  p_scope text,
  p_key text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_next_attempts integer;
  v_recent_events integer;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF p_scope = 'auth.password_account_failure' THEN
    -- The route establishes this signed self principal from the exact login candidate (or a
    -- deterministic nonexistent-account decoy). A caller cannot increment another account by key.
    v_user_id := app.require_staff_security_self_user_id();
    IF p_key IS DISTINCT FROM v_user_id::text THEN
      RAISE EXCEPTION 'password_failure_principal_mismatch';
    END IF;

    SELECT credentials.failed_attempts, credentials.locked_until
    INTO v_failed_attempts, v_locked_until
    FROM public.user_password_credentials AS credentials
    WHERE credentials.user_id = v_user_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT count(*)::integer
      INTO v_recent_events
      FROM public.auth_rate_limit_events AS event
      WHERE event.scope = p_scope
        AND event.key = p_key
        AND event.occurred_at > v_now - interval '15 minutes';

      v_next_attempts := CASE
        WHEN v_recent_events = 0 THEN 1
        WHEN v_failed_attempts >= 10
          AND v_locked_until IS NOT NULL
          AND v_locked_until <= v_now
          THEN 1
        ELSE v_failed_attempts + 1
      END;

      UPDATE public.user_password_credentials AS credentials
      SET failed_attempts = v_next_attempts,
          locked_until = CASE
            WHEN v_next_attempts >= 10 THEN v_now + interval '15 minutes'
            WHEN v_next_attempts >= 5
              THEN v_now + make_interval(
                secs => (30 * power(2, v_next_attempts - 5))::double precision
              )
            ELSE NULL
          END
      WHERE credentials.user_id = v_user_id;
    END IF;

    -- Keep the bounded event window relative to the latest consecutive failure, not the first:
    -- the accepted 30/60/120/240/480-second delays otherwise outlive a fixed 15-minute window.
    UPDATE public.auth_rate_limit_events AS event
    SET occurred_at = v_now
    WHERE event.scope = p_scope
      AND event.key = p_key;
  ELSIF p_scope = 'auth.password_identifier_failure' THEN
    UPDATE public.auth_rate_limit_events AS event
    SET occurred_at = v_now
    WHERE event.scope = p_scope
      AND event.key = p_key;
  END IF;

  INSERT INTO public.auth_rate_limit_events (scope, key, occurred_at)
  VALUES (p_scope, p_key, v_now);
END
$function$;

CREATE OR REPLACE FUNCTION app.set_staff_security_self_password_hash(
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := app.require_staff_security_self_user_id();

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = COALESCE(p_password_hash, credentials.password_hash),
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = CASE
        WHEN p_password_hash IS NULL THEN credentials.updated_at
        ELSE statement_timestamp()
      END
  WHERE credentials.user_id = v_user_id;

  RETURN FOUND;
END
$function$;

COMMENT ON COLUMN public.user_password_credentials.failed_attempts IS
  'Consecutive failed password proofs; reset after a successful password proof.';
COMMENT ON COLUMN public.user_password_credentials.locked_until IS
  'Current password backoff deadline; attempts 5-9 use 30/60/120/240/480 seconds, attempt 10 uses 15 minutes.';
COMMENT ON FUNCTION app.auth_rate_limit_record(text, text) IS
  'Records one rate-limit event; password-account scope also atomically updates only the signed self credential failure state.';
COMMENT ON FUNCTION app.set_staff_security_self_password_hash(text) IS
  'Staff-security self action: replaces the own hash when non-null and always resets password failure state.';
