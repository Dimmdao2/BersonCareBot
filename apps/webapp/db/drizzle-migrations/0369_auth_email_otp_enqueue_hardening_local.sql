-- TEMPORARY LOCAL MIGRATION NUMBER 0363 — final number assigned at land, per AGENTS.md §1.
--
-- D27-C, fix round 2 (audit d27c-fix-audit-20260804 FAIL): 0362's `app.email_auth_enqueue_otp_delivery`
-- closed the round-1 hole (forged `kind`/`organization_id`) but still accepted `p_payload_json` AS-IS --
-- a bootstrap-reachable caller (`app_patient`, the same DB role the anonymous public login route runs
-- under after SET ROLE) could enqueue a row with an ARBITRARY recipient and ARBITRARY message text under
-- the `auth_email_otp` label. The worker would have delivered it as a real email. Live PoC from the
-- audit:
--   SELECT app.email_auth_enqueue_otp_delivery('audit-abuse-test-001',
--     '{"type":"message.send","payload":{"recipient":{"email":"victim-arbitrary@example.com"},
--       "message":{"text":"ARBITRARY ATTACKER-CONTROLLED CONTENT..."}}}'::jsonb,
--     4, now(), 100::smallint);
--   → inserted = t
--
-- Fix: the function no longer accepts message content at all. It takes only the identifier of the
-- login attempt (`p_challenge_id`) and composes the recipient/text/subject itself by reading the
-- ALREADY-STORED email + a one-shot plaintext code off `public.email_challenges` -- the same table
-- `startEmailChallenge` already writes to, one call earlier in the same request. `max_attempts`,
-- `next_retry_at` and `priority` move from caller-supplied parameters to hardcoded constants inside the
-- function body (they were also unnecessarily attacker-controllable in 0362, even though the audit's PoC
-- didn't exploit that specific knob).
--
-- The plaintext code has nowhere else to come from: `email_challenges.code_hash` is a one-way hash
-- (raw OTPs never enter SQL for the VERIFY path, see emailAuth.ts:hashEmailChallengeCode), but the
-- delivery worker's email body has always needed the plaintext (it already sat in 0362's caller-supplied
-- `p_payload_json`, which is exactly the hole this migration closes). `pending_delivery_code` is that
-- plaintext, scoped to delivery only: written once by `startEmailChallenge` right after it mints the
-- challenge, format-locked to the exact 6-digit shape `generateEmailCode()` produces, and nulled out by
-- this same function the moment it is successfully queued -- verification never reads it, so nothing
-- downstream needs it to survive past enqueue.
ALTER TABLE public.email_challenges
  ADD COLUMN IF NOT EXISTS pending_delivery_code text;

ALTER TABLE public.email_challenges
  DROP CONSTRAINT IF EXISTS email_challenges_pending_delivery_code_format;
ALTER TABLE public.email_challenges
  ADD CONSTRAINT email_challenges_pending_delivery_code_format
  CHECK (pending_delivery_code IS NULL OR pending_delivery_code ~ '^[0-9]{6}$');

-- Narrow write accessor, same idiom as 0249's `email_auth_set_email_challenge_purpose`: a SEPARATE
-- accessor stamped immediately after insert, in the same request, rather than widening
-- `email_auth_insert_email_challenge`'s pinned signature. The CHECK above is the hard backstop; this
-- RAISE gives a caller a clean error instead of a bare constraint-violation SQLSTATE.
CREATE OR REPLACE FUNCTION app.email_auth_set_email_challenge_delivery_code(
  p_challenge_id uuid,
  p_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'email_auth_set_email_challenge_delivery_code: code must be exactly 6 digits';
  END IF;
  UPDATE public.email_challenges SET pending_delivery_code = p_code WHERE id = p_challenge_id;
END
$function$;

COMMENT ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) IS
  'D27-C fix round 2: stashes the plaintext OTP for delivery composition only (never used for verification, which stays on code_hash). Format-locked to 6 digits; email_auth_enqueue_otp_delivery nulls it out once queued.';

-- 0362's signature (text, jsonb, integer, timestamptz, smallint) accepted caller-composed message
-- content -- DROP it outright rather than CREATE OR REPLACE (which would only add an overload and leave
-- the vulnerable 5-arg version reachable).
DROP FUNCTION IF EXISTS app.email_auth_enqueue_otp_delivery(text, jsonb, integer, timestamptz, smallint);

CREATE FUNCTION app.email_auth_enqueue_otp_delivery(p_challenge_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
  v_code text;
  v_expires_at bigint;
  v_event_id text;
  v_last_sent_at timestamptz;
  v_row_count integer;
BEGIN
  -- FOR UPDATE: this and the pending_delivery_code = NULL write below run in the same statement's
  -- transaction, so two concurrent calls against the SAME challenge can't both read a non-null code.
  SELECT user_id, email, pending_delivery_code, expires_at
  INTO v_user_id, v_email, v_code, v_expires_at
  FROM public.email_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  -- No such challenge, or it was already queued once (pending_delivery_code nulled below on success):
  -- refuse silently, same as "not found". This is what makes a repeat call with the same challenge id
  -- a no-op instead of a second send.
  IF NOT FOUND OR v_code IS NULL THEN
    RETURN false;
  END IF;

  IF v_expires_at <= extract(epoch FROM now())::bigint THEN
    RETURN false;
  END IF;

  -- Function-level throttle (audit FAIL #3): the public route's 60s resend cooldown lives in
  -- emailAuth.ts and never runs for a caller that reaches this SECURITY DEFINER function directly --
  -- app_patient is anonymously reachable, the same as the route's own bootstrap principal. Reuse the
  -- SAME cooldown ledger the route itself writes to (email_send_cooldowns) as an in-DB backstop: no
  -- new bookkeeping table, and it can never fire for a legitimate call (the route already waits out
  -- this exact window before it ever reaches here).
  SELECT last_sent_at INTO v_last_sent_at
  FROM public.email_send_cooldowns
  WHERE user_id = v_user_id AND email_normalized = v_email;

  IF v_last_sent_at IS NOT NULL AND v_last_sent_at > now() - interval '60 seconds' THEN
    RETURN false;
  END IF;

  v_event_id := 'auth-otp:email:' || p_challenge_id::text;

  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NULL, v_event_id, 'auth_email_otp', 'email',
    jsonb_build_object(
      'intent', jsonb_build_object(
        'type', 'message.send',
        'meta', jsonb_build_object(
          'eventId', 'otp:email:' || gen_random_uuid()::text,
          'occurredAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z',
          'source', 'email',
          'outboundMessageClass', 'auth_code',
          'outboundCapability', 'auth_code'
        ),
        'payload', jsonb_build_object(
          'recipient', jsonb_build_object('email', v_email),
          'message', jsonb_build_object('text', 'Ваш код BersonCare: ' || v_code),
          'delivery', jsonb_build_object('channels', jsonb_build_array('email')),
          'subject', 'Код подтверждения BersonCare'
        )
      )
    ),
    -- Same constants 0362 took as caller-supplied parameters (AUTH_EMAIL_OTP_MAX_ATTEMPTS /
    -- AUTH_EMAIL_OTP_QUEUE_PRIORITY in pgAuthEmailOtpDeliveryQueue.ts) -- hardcoded here too, since
    -- they never legitimately vary per call and there is no reason to leave them attacker-settable.
    'pending', 0, 4, now(), 100
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count > 0 THEN
    -- One-shot: clear the plaintext the moment it's queued. Verification uses code_hash, never this
    -- column, so nothing downstream needs it to survive past this point.
    UPDATE public.email_challenges SET pending_delivery_code = NULL WHERE id = p_challenge_id;
    INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
    VALUES (v_user_id, v_email, now())
    ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now();
  END IF;

  RETURN v_row_count > 0;
END
$function$;

COMMENT ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid) IS
  'D27-C fix round 2: composes the auth-code email itself from public.email_challenges (recipient, code, kind, channel, organization_id all fixed/derived, never caller-supplied) instead of accepting a payload. Function-level 60s cooldown via email_send_cooldowns backstops direct calls that bypass the public route''s own rate limit.';

DO $email_auth_enqueue_otp_delivery_owner$
BEGIN
  -- Same guarded ownership transfer as 0245/0247/0248/0249/0360: a database that never provisioned the
  -- runtime roles (local dev box, CI scratch DB) still applies this migration instead of hard-failing
  -- the whole chain on a role it does not have.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0363: role app_owner absent; email_auth_set_email_challenge_delivery_code/email_auth_enqueue_otp_delivery keep the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0363: % is not a member of app_owner; email_auth_set_email_challenge_delivery_code/email_auth_enqueue_otp_delivery keep the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_enqueue_otp_delivery(uuid) OWNER TO app_owner;
  END IF;
END
$email_auth_enqueue_otp_delivery_owner$;

REVOKE ALL ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid) FROM PUBLIC;

DO $email_auth_enqueue_otp_delivery_grants$
BEGIN
  -- Same grantee class as every other app.email_auth_*/app.email_otp_public_* accessor reachable from
  -- the bootstrap/public login path (app_patient only).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid) TO app_patient;
  END IF;
END
$email_auth_enqueue_otp_delivery_grants$;
