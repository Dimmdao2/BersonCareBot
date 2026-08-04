-- TEMPORARY LOCAL MIGRATION NUMBER 0370 -- final number assigned at land, per AGENTS.md §1.
--
-- D27-C, fix round 3 (audit d27c-fix2-audit-20260804 FAIL). Round 2 (migration 0369, formerly 0363)
-- closed the arbitrary-message-content hole but left both bootstrap-reachable accessors trusting a
-- bare challenge_id with no proof the caller is the request that created it. Live PoC from the audit,
-- run from a SEPARATE anonymous session against a challenge_id it never minted:
--
--   SELECT app.email_auth_enqueue_otp_delivery('<victim challenge_id>'::uuid);
--     -> forced a second send of the victim's already-composed code
--
--   SELECT app.email_auth_set_email_challenge_delivery_code('<victim challenge_id>'::uuid, '000777');
--   SELECT app.email_auth_enqueue_otp_delivery('<victim challenge_id>'::uuid);
--     -> victim received "Ваш код BersonCare: 000777" -- attacker-chosen code, real send
--
-- Root cause: app_patient is the shared DB role every anonymous request runs under after SET ROLE
-- (see 0360's header) -- there is no per-request DB identity to grant against, so "only the request
-- that owns this challenge may act on it" cannot be expressed as a GRANT. It has to be a secret the
-- database mints and hands back exactly once, to exactly the caller who is allowed to hold it.
--
-- Fix -- a per-row, one-shot ownership token (`delivery_token`), guarded by a SEPARATE permanent
-- marker (`delivery_claimed_at`) that is never cleared:
--
--   * `email_auth_set_email_challenge_delivery_code` now claims a challenge row EXACTLY ONCE, via an
--     atomic `UPDATE ... WHERE delivery_claimed_at IS NULL RETURNING delivery_token`, and hands the
--     freshly minted token back to (only) its caller. A second claim attempt against the same row --
--     exactly what the audit's overwrite PoC depends on -- now finds no matching row and is refused
--     with an exception instead of silently overwriting. This is sufficient, not just accidentally
--     timing-safe: `startEmailChallenge` never returns `challengeId` to anyone until AFTER this claim
--     call and the subsequent enqueue call have both already run (emailAuth.ts, insertEmailChallenge
--     is awaited before enqueueEmailOtpDelivery, which is awaited before the function returns) -- so
--     no external caller, legitimate or not, can ever learn a challenge_id while its claim window is
--     still open.
--   * `email_auth_enqueue_otp_delivery` now takes the token as a required second argument and only
--     acts if it matches the row's stored `delivery_token` -- knowledge of challenge_id alone is no
--     longer sufficient to trigger a send. A successful send clears `pending_delivery_code` and
--     `delivery_token` back to NULL (still one-shot for the SEND itself: a repeat call, even with the
--     right token, is a no-op) but leaves `delivery_claimed_at` set. That separation matters: without
--     it, the claim guard above (`... IS NULL`) would read as "virgin" again the instant a successful
--     send nulls `delivery_token`, letting anyone who still knows the challenge_id re-claim and
--     re-arm a challenge AFTER it already sent -- `delivery_claimed_at` is written once by the claim
--     and never written to again by anything, so that reopening is impossible regardless of what
--     enqueue does to the other two columns.
--
-- The token never reaches the client: `challengeId` is the only field `startPublicEmailOtpChallenge`
-- returns in the HTTP response (emailOtpPublic.ts); `deliveryToken` lives only in the server-side
-- return value threaded from `insertEmailChallenge` straight into `enqueueEmailOtpDelivery` within the
-- same request (emailAuth.ts).
--
-- Separately discovered while proving the golden path for THIS migration (disposable-postgres
-- integration test, real Postgres, real roles): `app_owner` -- the owner of
-- `email_auth_enqueue_otp_delivery` since it was first introduced (migration 0360) -- has never
-- actually been granted INSERT on `public.outgoing_delivery_queue` anywhere in this repository.
-- 0338/0339 grant it SELECT/UPDATE there (reminder materialization/claim); nothing grants INSERT.
-- `deploy/host/deploy-test-saas.sh`'s `assert_app_owner_secdef_table_grants_complete` required-grant
-- set (the gate that exists specifically to catch this class of gap, per its own header quoting the
-- prior `email_challenges` incident) does not list this row either, so it was never asserted. Without
-- it, EVERY call to `email_auth_enqueue_otp_delivery` -- round 1 through this one -- hits `permission
-- denied for table outgoing_delivery_queue` on the INSERT and silently degrades to
-- `email_send_failed` (emailAuth.ts's catch branch) on any environment provisioned strictly from this
-- repo's own migrations + deploy/postgres files. Fixed here because it sits directly on the one code
-- path this round is required to prove reaches `sent`.
GRANT INSERT ON TABLE public.outgoing_delivery_queue TO app_owner;

ALTER TABLE public.email_challenges
  ADD COLUMN IF NOT EXISTS delivery_token uuid;
ALTER TABLE public.email_challenges
  ADD COLUMN IF NOT EXISTS delivery_claimed_at timestamptz;

-- Return-type change (void -> uuid) needs DROP + CREATE; CREATE OR REPLACE refuses that. Same idiom
-- 0363 already used for enqueue's signature change.
DROP FUNCTION IF EXISTS app.email_auth_set_email_challenge_delivery_code(uuid, text);

CREATE FUNCTION app.email_auth_set_email_challenge_delivery_code(
  p_challenge_id uuid,
  p_code text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_token uuid;
BEGIN
  IF p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'email_auth_set_email_challenge_delivery_code: code must be exactly 6 digits';
  END IF;

  -- One-shot claim, guarded by the PERMANENT marker (never cleared by anything, unlike
  -- pending_delivery_code/delivery_token which enqueue nulls out on a successful send). A second call
  -- for the same challenge_id, from anyone, at any point in the row's lifetime, finds no matching row.
  UPDATE public.email_challenges
  SET pending_delivery_code = p_code,
      delivery_token = gen_random_uuid(),
      delivery_claimed_at = now()
  WHERE id = p_challenge_id
    AND delivery_claimed_at IS NULL
  RETURNING delivery_token INTO v_token;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'email_auth_set_email_challenge_delivery_code: challenge not found or already claimed';
  END IF;

  RETURN v_token;
END
$function$;

COMMENT ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) IS
  'D27-C fix round 3: one-shot claim, guarded by the permanent delivery_claimed_at marker -- mints and returns delivery_token, the ownership secret email_auth_enqueue_otp_delivery requires. Refuses a second claim against the same row at any point in its lifetime (RAISE), which is what stops a stranger from overwriting an already-pending code, including after it has already been sent.';

-- Signature change (adds the ownership token) needs DROP + CREATE; CREATE OR REPLACE refuses that.
DROP FUNCTION IF EXISTS app.email_auth_enqueue_otp_delivery(uuid);

CREATE FUNCTION app.email_auth_enqueue_otp_delivery(p_challenge_id uuid, p_delivery_token uuid)
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
  -- FOR UPDATE: this and the pending_delivery_code/delivery_token = NULL write below run in the same
  -- statement's transaction, so two concurrent calls against the SAME challenge can't both read a
  -- non-null code. The delivery_token equality check is the ownership gate D27-C fix round 3 adds --
  -- a caller that does not already hold the token minted by set_email_challenge_delivery_code simply
  -- finds no row here, same as an unknown challenge_id.
  SELECT user_id, email, pending_delivery_code, expires_at
  INTO v_user_id, v_email, v_code, v_expires_at
  FROM public.email_challenges
  WHERE id = p_challenge_id
    AND delivery_token IS NOT NULL
    AND delivery_token = p_delivery_token
  FOR UPDATE;

  -- No such challenge, wrong/absent token, or already queued once (both columns nulled below on
  -- success): refuse silently, same as "not found".
  IF NOT FOUND OR v_code IS NULL THEN
    RETURN false;
  END IF;

  IF v_expires_at <= extract(epoch FROM now())::bigint THEN
    RETURN false;
  END IF;

  -- Function-level throttle (audit FAIL #3, round 2): reuse the SAME cooldown ledger the public route
  -- itself writes to (email_send_cooldowns) as an in-DB backstop for a caller that reaches this
  -- SECURITY DEFINER function directly.
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
    'pending', 0, 4, now(), 100
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count > 0 THEN
    -- One-shot: clear the plaintext AND the ownership token the moment it's queued. Neither
    -- verification nor any other accessor reads them past this point.
    UPDATE public.email_challenges
    SET pending_delivery_code = NULL, delivery_token = NULL
    WHERE id = p_challenge_id;
    INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
    VALUES (v_user_id, v_email, now())
    ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now();
  END IF;

  RETURN v_row_count > 0;
END
$function$;

COMMENT ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) IS
  'D27-C fix round 3: requires the ownership token minted by email_auth_set_email_challenge_delivery_code for this exact challenge -- a bare challenge_id (round 2''s only input) is no longer sufficient to force a send. Composes the auth-code email itself from public.email_challenges, same as round 2.';

DO $email_auth_enqueue_otp_delivery_owner$
BEGIN
  -- Same guarded ownership transfer as 0245/0247/0248/0249/0360/0363: a database that never
  -- provisioned the runtime roles (local dev box, CI scratch DB) still applies this migration instead
  -- of hard-failing the whole chain on a role it does not have.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0370: role app_owner absent; email_auth_set_email_challenge_delivery_code/email_auth_enqueue_otp_delivery keep the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0370: % is not a member of app_owner; email_auth_set_email_challenge_delivery_code/email_auth_enqueue_otp_delivery keep the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) OWNER TO app_owner;
  END IF;
END
$email_auth_enqueue_otp_delivery_owner$;

REVOKE ALL ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) FROM PUBLIC;

DO $email_auth_enqueue_otp_delivery_grants$
BEGIN
  -- Same grantee class as every other app.email_auth_*/app.email_otp_public_* accessor reachable from
  -- the bootstrap/public login path (app_patient only).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) TO app_patient;
  END IF;
END
$email_auth_enqueue_otp_delivery_grants$;
