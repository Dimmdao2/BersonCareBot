-- 0248: decaying OTP lockout (night plan C-2, step 3), replacing the flat OTP_LOCK_DURATION_SEC
-- (600s) block for the AUTHENTICATED email/phone login+registration engines that step 1
-- (0247_email_challenge_atomic_attempts.sql; PhoneChallengeStore.incrementVerifyAttempts) made
-- trustworthy to build on. Step 3 depends on step 1 being trustworthy -- it now is.
--
-- Sources, cited again in full at otpConstants.ts (owner ruling: "не изобретай" -- the curve comes
-- from named standards, not taste):
--   - NIST SP 800-63B §5.2.2: approved throttling includes "a period of time that increases as the
--     account approaches its maximum allowance" (example range 30 seconds up to an hour).
--   - OWASP Authentication Cheat Sheet: "exponential lockout, where the lockout duration starts...
--     very short... but doubles after each failed login attempt"; warns an uncapped lockout "can be
--     weaponized... to cause a denial of service" -- hence the hard cap below.
--   - NIST SP 800-63B §5.2.2: "disregard any previous failed attempts... after successful
--     authentication" -- the escalation cycle resets to 0 on the next success.
--   - Shape (lead's decision from that research): first lockout 2 min, doubling per cycle, hard cap
--     30 min, cycle resets on the next successful verification. Owner constraint: nothing this
--     migration creates may leave a legitimate user/clinic locked out for longer than the 30-minute
--     cap with no self-service path back -- explicitly NOT Auth0's default shape (10 failures ->
--     block that expires only after 30 days, manual/e-mail unblock).
--
-- PHONE: `phone_otp_locks` already exists (016_phone_challenges_otp.sql) and is queried DIRECTLY by
-- `pgPhoneOtpLimits.ts` (no SECURITY DEFINER wrapper -- that table already has a direct app_owner
-- grant, see 0245's grant block below and p0-5b-grants.sql for app_staff). This migration only adds
-- the cycle counter column; the atomic escalate/reset SQL is added to pgPhoneOtpLimits.ts in the
-- same style as every other query in that file.
--
-- NOTE -- shared table, read before touching either side again: `phone_otp_locks` is ALSO written by
-- the UNRELATED anonymous A-3 booking OTP engine
-- (`app.phone_otp_public_booking_consume_challenge`, 0245), which does its own flat `locked_until`
-- upsert and never references `lockout_cycle` (leaves it at whatever it already is; defaults to 0 on
-- its own first-ever insert for a phone number). That engine is explicitly out of this step's scope
-- (the night-plan WHERE section names only phoneOtpLimits.ts/pgPhoneChallengeStore) and its function
-- body is NOT touched here. The two engines sharing one row means a booking-triggered lock can leave
-- a stale `lockout_cycle` for a number that later also fails the authenticated engine -- harmless,
-- because the authenticated engine's own duration formula re-caps at 1800s regardless of the
-- exponent it reads, so the 30-minute self-service bound holds either way.
--
-- EMAIL: there is no lock table at all today. `email_challenges.attempts` reaching
-- OTP_MAX_VERIFY_ATTEMPTS only deletes the challenge and returns an INFORMATIONAL
-- `retryAfterSeconds` to the caller -- nothing stops `startEmailChallenge` from being called again
-- the moment the unrelated 60s resend cooldown passes, issuing a fresh challenge with attempts back
-- at 0. This migration adds the smallest table consistent with the phone side (one row per identity,
-- a lock timestamp, a cycle counter) plus three SECURITY DEFINER accessors -- because, unlike
-- phone_otp_locks, app_patient has NO direct table grant anywhere in this family
-- (p0-5b-grants.sql lists email_challenges in the app_staff set only) and every existing accessor
-- for this table family (app.email_auth_*, re-applied on every deploy by
-- deploy/postgres/organization-member-invites-rls.sql) already goes through an app_owner-owned
-- SECURITY DEFINER function for exactly that reason -- this migration follows the same shape rather
-- than inventing a second access style for one table.
--
-- Closure-resurrection check (the exact class step 1 found live): this migration only ADDS three new
-- function names and one new table. `organization-member-invites-rls.sql`'s re-applied function list
-- is a fixed, explicit enumeration (grep it) that does not mention any of the three names below, and
-- this migration modifies none of the functions that closure DOES define -- so nothing here needs a
-- matching edit there. Contrast step 1, which modified/dropped a function that closure re-creates
-- verbatim on every deploy and therefore HAD to move in the same commit.

ALTER TABLE phone_otp_locks
  ADD COLUMN IF NOT EXISTS lockout_cycle INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_otp_locks (
  user_id UUID PRIMARY KEY,
  locked_until BIGINT NOT NULL DEFAULT 0,
  lockout_cycle INTEGER NOT NULL DEFAULT 0
);

-- Base table ACL for app_owner (BYPASSRLS is not a substitute for the SQL-level GRANT a SECURITY
-- DEFINER function still needs -- deploy-test-saas.sh:assert_app_owner_secdef_table_grants_complete
-- exists to catch exactly this class of gap). This is a brand-new table with no dedicated
-- deploy/postgres overlay, so this migration is its canonical grant site (same reasoning as 0245 for
-- phone_challenges/phone_otp_locks).
DO $email_otp_locks_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_otp_locks TO app_owner;
  END IF;
END
$email_otp_locks_owner_grants$;

CREATE FUNCTION app.email_auth_find_email_otp_lock(p_user_id uuid)
RETURNS TABLE (locked_until bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT l.locked_until FROM public.email_otp_locks AS l WHERE l.user_id = p_user_id
$function$;

COMMENT ON FUNCTION app.email_auth_find_email_otp_lock(uuid) IS
  'Decaying OTP lockout (C-2 step 3): read-only gate check for startEmailChallenge. Returns the current locked_until epoch second for this user, or zero rows if never locked / already reset.';

CREATE FUNCTION app.email_auth_register_email_otp_lockout(p_user_id uuid)
RETURNS TABLE (locked_until bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
BEGIN
  -- Escalating delay that doubles per cycle, capped (NIST SP 800-63B §5.2.2 / OWASP Authentication
  -- Cheat Sheet, cited in full at the top of this migration and in otpConstants.ts):
  -- 120 * 2^cycle seconds, where `cycle` is the row's value BEFORE this statement (an UPDATE's SET
  -- clause in Postgres always reads the pre-update row, and the INSERT branch below starts from the
  -- equivalent of cycle=0). So a brand-new lockout is 120s (2 min); the next escalation for the SAME
  -- user is 240s (4 min), then 480, then 960, and the 5th escalation onward is capped at 1800s
  -- (30 min) -- must stay numerically identical to otpConstants.ts:nextOtpLockoutDurationSeconds.
  -- The exponent is capped at 10 before exponentiating purely so a long-uncapped cycle counter can
  -- never approach bigint range; it never changes the resulting (already-capped) duration.
  -- ON CONFLICT is Postgres's own serialization point for two concurrent escalations against the
  -- same user_id -- see pgEmailOtpLockAtomicEscalation.devDb.integration.test.ts.
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

COMMENT ON FUNCTION app.email_auth_register_email_otp_lockout(uuid) IS
  'Decaying OTP lockout (C-2 step 3): atomically escalates this user''s lockout cycle (120s, 240s, 480s, 960s, capped at 1800s) and returns the new locked_until epoch second.';

CREATE FUNCTION app.email_auth_reset_email_otp_lockout(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  DELETE FROM public.email_otp_locks WHERE user_id = p_user_id
$function$;

COMMENT ON FUNCTION app.email_auth_reset_email_otp_lockout(uuid) IS
  'Decaying OTP lockout (C-2 step 3): NIST SP 800-63B §5.2.2 -- disregard previous failed attempts after a successful verification. Deletes the lock row so the next lockout starts at cycle 1 (2 min) again.';

DO $email_otp_locks_accessor_owner$
BEGIN
  -- Same guarded ownership transfer as 0245/0247: a database that never provisioned the runtime
  -- roles (local dev box, CI scratch DB) still applies this migration instead of hard-failing the
  -- whole chain on a role it does not have.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0248: role app_owner absent; email OTP lock accessors keep the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0248: % is not a member of app_owner; email OTP lock accessors keep the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_find_email_otp_lock(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_register_email_otp_lockout(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_reset_email_otp_lockout(uuid) OWNER TO app_owner;
  END IF;
END
$email_otp_locks_accessor_owner$;

REVOKE ALL ON FUNCTION app.email_auth_find_email_otp_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_register_email_otp_lockout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_reset_email_otp_lockout(uuid) FROM PUBLIC;

DO $email_otp_locks_accessor_grants$
BEGIN
  -- Same grantee class as every other app.email_auth_* accessor (app_patient only -- the
  -- authenticated email flows stamp a principal that webappPoolProvider routes to the nonstaff
  -- pool).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_find_email_otp_lock(uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_register_email_otp_lockout(uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_reset_email_otp_lockout(uuid) TO app_patient;
  END IF;
END
$email_otp_locks_accessor_grants$;
