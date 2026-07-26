-- 0247: atomic email-challenge wrong-attempt counter (night plan C-2, step 1).
--
-- `app.email_auth_update_email_challenge_attempts(uuid, integer)` took the NEXT attempt count as an
-- argument computed by the CALLER from an earlier, separate read (via
-- `email_auth_find_email_challenge_for_confirm` / `..._for_consume` / `..._find_latest_*_for_user`)
-- and blindly overwrote the column with it (`SET attempts = p_attempts`). Two concurrent wrong-code
-- confirms against the SAME challenge each read attempts=N, each compute next=N+1 from that same
-- stale read, and each write N+1 back -- one increment is silently lost. This is a real lost-update
-- bug (verified with real concurrent Postgres connections, see
-- pgEmailChallengeAtomicAttempts.devDb.integration.test.ts), not a theoretical one: the read and the
-- write were two separate round trips with no lock held between them.
--
-- Fix -- same idiom as `app.email_otp_public_consume_latest_challenge` (0232) and
-- `app.phone_otp_public_booking_consume_challenge` (0245): lock the row first, then let the
-- DATABASE compute the new value with `SET attempts = attempts + 1 ... RETURNING attempts`, never
-- the application. Concurrent UPDATEs to the same row serialize on Postgres's own row lock -- the
-- second writer's `+ 1` always applies to the first writer's already-committed value, never to a
-- value read before it, so N concurrent wrong-code attempts always produce a count of exactly N.
--
-- The old function is DROPPED, not left dangling: an absolute-set attempts accessor is exactly the
-- anti-pattern this migration removes, and leaving it reachable would let a stale caller reintroduce
-- the same lost update. Net app_owner SECURITY DEFINER count is UNCHANGED by this migration (one
-- dropped, one added) -- see deploy/host/deploy-test-saas.sh:assert_app_owner_secdef_table_grants_complete
-- (still pinned at 58). The runtime overlay deploy/postgres/organization-member-invites-rls.sql,
-- which re-asserts this function on every TEST deploy, moves in the same commit -- otherwise it
-- would silently recreate the dropped absolute-set function on the next deploy.

DROP FUNCTION IF EXISTS app.email_auth_update_email_challenge_attempts(uuid, integer);

CREATE FUNCTION app.email_auth_increment_email_challenge_attempts(
  p_challenge_id uuid
)
RETURNS TABLE (attempts integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
BEGIN
  -- Lock the row first (same idiom as 0232/0245): a concurrent resend/expiry cleanup, or a second
  -- caller incrementing the SAME challenge, must not interleave with this one.
  PERFORM 1 FROM public.email_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- `RETURNS TABLE (attempts integer)` makes `attempts` an OUT-parameter variable in this
  -- function's scope, which would otherwise collide with the `email_challenges.attempts` column
  -- in the UPDATE below ("column reference attempts is ambiguous", caught live against a real DB).
  -- `#variable_conflict use_column` above resolves every bare `attempts` reference in this body to
  -- the table column, exactly like 0232/0245 already do for their own SET/comparison clauses.
  -- `email_challenges.attempts` is `smallint` (same column every other accessor in this file casts
  -- with `::integer`, e.g. email_auth_find_email_challenge_for_confirm); RETURN QUERY requires an
  -- exact type match against the declared `RETURNS TABLE (attempts integer)`, caught live against a
  -- real DB ("structure of query does not match function result type").
  RETURN QUERY
  UPDATE public.email_challenges
  SET attempts = attempts + 1
  WHERE id = p_challenge_id
  RETURNING public.email_challenges.attempts::integer;
END
$function$;

COMMENT ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) IS
  'Atomic SECURITY DEFINER wrong-attempt counter for email_challenges: locks the row then lets the database compute attempts + 1, so concurrent wrong-code confirms against the same challenge can never lose an increment. Returns zero rows if the challenge no longer exists.';

DO $email_auth_increment_attempts_owner$
BEGIN
  -- Same guarded ownership transfer as 0245: a database that never provisioned the runtime roles
  -- (local dev box, CI scratch DB) still applies this migration instead of hard-failing the whole
  -- chain on a role it does not have. On TEST/PROD, where app_owner exists and this migration's
  -- executing role is granted membership for the step, the transfer applies normally.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0247: role app_owner absent; email_auth_increment_email_challenge_attempts keeps the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0247: % is not a member of app_owner; email_auth_increment_email_challenge_attempts keeps the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) OWNER TO app_owner;
  END IF;
END
$email_auth_increment_attempts_owner$;

REVOKE ALL ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) FROM PUBLIC;

DO $email_auth_increment_attempts_grants$
BEGIN
  -- Same grantee as the function it replaces: app_patient only (verified against the existing
  -- GRANT EXECUTE ... email_auth_update_email_challenge_attempts ... TO app_patient in
  -- deploy/postgres/organization-member-invites-rls.sql -- no wider surface is added).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) TO app_patient;
  END IF;
END
$email_auth_increment_attempts_grants$;
