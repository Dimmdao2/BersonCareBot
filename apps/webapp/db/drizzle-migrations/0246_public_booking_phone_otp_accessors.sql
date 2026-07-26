-- 0246_public_booking_phone_otp_accessors: make the A-3 anonymous booking OTP path reachable under
-- the real role model, without handing a runtime role a table GRANT.
--
-- Root cause this migration closes. Commits 124d7d074 + 73cfaf547 made anonymous booking prove
-- control of the contact before the booking exists (owner ruling: «всегда просить код или вход»).
-- Both `POST /api/booking/public/create` and `.../create/confirm` call `stampBootstrapPrincipal`,
-- and `infra/db/webappPoolProvider.ts:choosePoolKindForPrincipal` routes a `bootstrap` principal to
-- the NONSTAFF pool — i.e. `app_patient`. But `deploy/postgres/p0-5b-grants.sql` lists
-- `public.phone_challenges` and `public.phone_otp_locks` in the app_staff set only; app_patient is
-- deliberately excluded. Reproduced live on DEV, 2026-07-26:
--
--     psql "$DATABASE_URL_NONSTAFF" -c 'select count(*) from phone_challenges'
--     ERROR:  permission denied for table phone_challenges
--
-- So the flow works on DEV only for as long as somebody hand-grants the runtime role those tables.
-- A runtime-role GRANT is the WRONG remedy here and is not used: `deploy/host/deploy-test-saas.sh`
-- asserts an exact per-role privilege set, and an extra grant turns the deploy FATAL mid-run (that
-- took TEST down on 2026-07-24).
--
-- Fix — the same shape the public e-mail OTP path already uses: narrow SECURITY DEFINER accessors,
-- owned by app_owner (NOLOGIN, BYPASSRLS, zero members, not request-reachable), `SET search_path`
-- pinned to pg_catalog, EXECUTE revoked from PUBLIC and granted only to the calling role. Modelled
-- literally on `app.email_otp_public_consume_latest_challenge` (0232_email_otp_atomic_consume.sql).
--
-- TWO accessors, and deliberately only two:
--
--   1. `phone_otp_public_booking_issue_challenge` — the whole of step 1's database work in one
--      call: expire stale locks, honour the per-phone lockout, honour the per-phone resend
--      cooldown, drop any previous challenge for the number, insert the new one with the
--      server-pinned booking intent. It exists as ONE function rather than the four reads/writes
--      the app used to issue (`phone_otp_locks` delete + select, `phone_challenges` max(created_at)
--      + delete + insert) because those four are a single decision; splitting them is what let two
--      concurrent requests both pass the cooldown check before either wrote a row. It RETURNS ONLY
--      A BOOLEAN — no countdown, no row, nothing keyed on the phone number. That matters: the
--      per-phone cooldown is exactly the fact 73cfaf547 stopped echoing at the HTTP layer, because
--      reading back a countdown for a number tells the caller somebody recently asked for a code
--      for it. There is no reason to hand that back at the database layer either.
--
--   2. `phone_otp_public_booking_consume_challenge` — verify and consume, in one transaction.
--      The code comparison happens INSIDE the function, exactly as the e-mail accessor compares the
--      hash inside, so the plaintext code never has to be readable by the calling role. It returns
--      the pinned intent (which the caller itself supplied at step 1) and which channel delivered
--      the code — never the code, never the phone, never any other challenge. The challenge row is
--      deleted in the same transaction that accepts the code, so a code cannot be replayed.
--
-- What is deliberately NOT exposed: any accessor that hands back a challenge row. A
-- `get_challenge(challenge_id)` returning `code` would let the anonymous role read the plaintext
-- one-time code of ANY outstanding challenge — including a staff login challenge, since all phone
-- flows share this table — which is the problem the accessors exist to solve, one layer down.
--
-- Every tunable (TTL, resend cooldown, max attempts, lock duration, delivery channel) is a
-- PARAMETER, not a literal in the function body: `modules/auth/otpConstants.ts` stays the single
-- source of truth and these functions cannot drift from it.

-- The base table ACLs app_owner needs. app_owner is BYPASSRLS, but BYPASSRLS is not a substitute
-- for the SQL-level GRANT a SECURITY DEFINER function still needs (the exact class
-- deploy-test-saas.sh:assert_app_owner_secdef_table_grants_complete exists to catch). There is no
-- dedicated deploy/postgres overlay for these two tables — p0-5b-grants.sql only ever touches
-- app_staff/app_patient — so this migration is their canonical grant site, the same way
-- 0238_org_brand_publication.sql is for org_enrollments/be_organizations.
DO $phone_otp_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_challenges TO app_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_otp_locks TO app_owner;
  END IF;
END
$phone_otp_owner_grants$;

CREATE OR REPLACE FUNCTION app.phone_otp_public_booking_issue_challenge(
  p_phone text,
  p_challenge_id text,
  p_code text,
  p_ttl_sec integer,
  p_resend_cooldown_sec integer,
  p_delivery_channel text,
  p_intent jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now_sec bigint := extract(epoch FROM clock_timestamp())::bigint;
  v_locked_until bigint;
  v_last_created timestamptz;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = ''
     OR p_challenge_id IS NULL OR btrim(p_challenge_id) = ''
     OR p_code IS NULL OR btrim(p_code) = ''
     OR p_ttl_sec IS NULL OR p_ttl_sec <= 0
     OR p_resend_cooldown_sec IS NULL OR p_resend_cooldown_sec < 0
     OR p_delivery_channel IS NULL OR btrim(p_delivery_channel) = ''
     OR p_intent IS NULL OR jsonb_typeof(p_intent) <> 'object'
  THEN
    RETURN false;
  END IF;

  -- Same housekeeping the app used to do with a bare DELETE: expired lockouts stop counting.
  DELETE FROM public.phone_otp_locks WHERE locked_until <= v_now_sec;

  -- Serialise concurrent issues for the SAME number on this row. Everything below — the cooldown
  -- read and the insert that starts the next cooldown — is then one atomic decision.
  SELECT lock_row.locked_until
  INTO v_locked_until
  FROM public.phone_otp_locks AS lock_row
  WHERE lock_row.phone_normalized = p_phone
  FOR UPDATE;

  IF FOUND AND v_locked_until > v_now_sec THEN
    RETURN false;
  END IF;

  SELECT max(challenge.created_at)
  INTO v_last_created
  FROM public.phone_challenges AS challenge
  WHERE challenge.phone = p_phone;

  IF v_last_created IS NOT NULL
     AND extract(epoch FROM (clock_timestamp() - v_last_created)) < p_resend_cooldown_sec
  THEN
    RETURN false;
  END IF;

  -- One outstanding challenge per number, as `challengeStore.deleteByPhone` already enforced.
  DELETE FROM public.phone_challenges WHERE phone = p_phone;

  -- DO NOTHING, never DO UPDATE: an id that is somehow already taken must not be overwritten with
  -- a new code and a new intent — that would be a challenge-hijack primitive if a caller could ever
  -- influence the id. It cannot (the id is a server-minted 128-bit random in
  -- `issuePublicBookingVerification`), so this branch is unreachable in practice; it is written as a
  -- clean `false` rather than left to raise a unique-violation out of a SECURITY DEFINER function.
  INSERT INTO public.phone_challenges (
    challenge_id, phone, expires_at, code, channel_context, verify_attempts
  )
  VALUES (
    p_challenge_id,
    p_phone,
    v_now_sec + p_ttl_sec,
    p_code,
    jsonb_build_object('otpDelivery', p_delivery_channel, 'publicBookingIntent', p_intent),
    0
  )
  ON CONFLICT (challenge_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END
$function$;

COMMENT ON FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) IS
  'A-3 anonymous booking step 1: atomically gate (lockout + per-phone resend cooldown) and create the phone OTP challenge with its pinned booking intent. Returns ONLY true/false -- never a row, never a countdown keyed on the phone number.';

CREATE OR REPLACE FUNCTION app.phone_otp_public_booking_consume_challenge(
  p_challenge_id text,
  p_code text,
  p_max_attempts integer,
  p_lock_duration_sec integer
)
RETURNS TABLE (
  ok boolean,
  intent jsonb,
  delivery_channel text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_now_sec bigint := extract(epoch FROM clock_timestamp())::bigint;
  v_challenge public.phone_challenges%ROWTYPE;
  v_intent jsonb;
  v_next_attempts integer;
BEGIN
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = ''
     OR p_code IS NULL OR btrim(p_code) = ''
     OR p_max_attempts IS NULL OR p_max_attempts <= 0
     OR p_lock_duration_sec IS NULL OR p_lock_duration_sec < 0
  THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- Row lock first: verify, attempt-count and consume must not interleave with a second confirm
  -- carrying the same code. This is what makes the replay rejection a property of the database
  -- rather than of request ordering.
  SELECT challenge.*
  INTO v_challenge
  FROM public.phone_challenges AS challenge
  WHERE challenge.challenge_id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer;
    RETURN;
  END IF;

  v_intent := v_challenge.channel_context -> 'publicBookingIntent';

  -- Not a booking challenge. Fail WITHOUT touching it: consuming an attempt (or deleting the row)
  -- for an arbitrary challenge id would let this endpoint burn down a login challenge belonging to
  -- somebody else. `consumePublicBookingVerification` checks the intent before the code for the
  -- same reason; the ordering is preserved here.
  IF v_intent IS NULL OR jsonb_typeof(v_intent) <> 'object' THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.code IS NULL OR v_challenge.code <> p_code THEN
    UPDATE public.phone_challenges
    SET verify_attempts = verify_attempts + 1
    WHERE challenge_id = p_challenge_id
    RETURNING verify_attempts::integer INTO v_next_attempts;

    IF v_next_attempts >= p_max_attempts THEN
      DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
      INSERT INTO public.phone_otp_locks (phone_normalized, locked_until)
      VALUES (v_challenge.phone, v_now_sec + p_lock_duration_sec)
      ON CONFLICT (phone_normalized)
      DO UPDATE SET locked_until = EXCLUDED.locked_until;
      RETURN QUERY SELECT false, NULL::jsonb, NULL::text, p_lock_duration_sec;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- Single use: the challenge is spent in the same transaction that accepted the code.
  DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;

  RETURN QUERY SELECT
    true,
    v_intent,
    v_challenge.channel_context ->> 'otpDelivery',
    NULL::integer;
END
$function$;

COMMENT ON FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) IS
  'A-3 anonymous booking step 2: compare the code INSIDE the database, count attempts, lock out, and consume the challenge exactly once. Returns the caller''s own pinned intent and the delivery channel -- never the code, never the phone, never another challenge.';

DO $phone_otp_accessor_owner$
BEGIN
  -- The definer identity, exactly as 0232/0238/0240 do it. PostgreSQL only permits ALTER ... OWNER
  -- TO app_owner when the executing role is a MEMBER of app_owner; deploy-test-saas.sh grants that
  -- membership for the migration step and revokes it immediately after (app_owner must return to
  -- zero members). The membership condition is checked rather than assumed so a database that never
  -- provisioned the runtime roles — a local dev box, a CI scratch DB — still applies this migration
  -- instead of hard-failing the whole chain on a role it does not have. That is NOT a silent
  -- downgrade on TEST/PROD: if the transfer is skipped there, app_owner's SECURITY DEFINER count
  -- never reaches the pinned value and assert_app_owner_secdef_table_grants_complete FATALs.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0246: role app_owner absent; phone OTP booking accessors keep the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0246: % is not a member of app_owner; phone OTP booking accessors keep the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) OWNER TO app_owner;
    ALTER FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) OWNER TO app_owner;
  END IF;
END
$phone_otp_accessor_owner$;

REVOKE ALL ON FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) FROM PUBLIC;

DO $phone_otp_accessor_grants$
BEGIN
  -- app_patient only. The anonymous booking handlers stamp a `bootstrap` principal, which
  -- webappPoolProvider routes to the nonstaff pool; app_staff never reaches this path (a staff or
  -- organization principal would be on the staff pool, and the authenticated branch of
  -- `POST /api/booking/public/create` skips the code entirely). Same grantee class as the public
  -- e-mail OTP accessors in 0232.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) TO app_patient;
  END IF;
END
$phone_otp_accessor_grants$;
