-- 0249: bind email OTP challenges to the purpose they were minted for (night plan C-2, step 4 --
-- final step of the series; steps 1-3 landed in fefa3bbad/ed7ab130b).
--
-- THE DEFECT (reproduced live against a throwaway scratch DB before writing this migration):
-- `app.email_otp_public_consume_latest_challenge` (0232) selects the LATEST `email_challenges` row
-- for an e-mail address with no purpose/intent filter at all -- `WHERE challenge.email =
-- v_email_normalized ORDER BY created_at DESC LIMIT 1`. `email_challenges` is one shared table
-- written by `startEmailChallenge()` (modules/auth/emailAuth.ts), called from 8 different flows:
-- public login (email-otp/start), public patient registration (email-otp/register), clinic-invite
-- acceptance, specialist signup, password reset, password setup, password+email registration,
-- authenticated email verification, and admin-initiated patient email change. A code minted for one
-- of those -- e.g. a password-RESET code, sent because the user forgot their password -- is
-- redeemable through a DIFFERENT flow's confirm route, e.g. the anonymous LOGIN route
-- POST /api/auth/email-otp/confirm, which establishes a full session: a "prove you can receive
-- e-mail at this address for password recovery" code becomes a login credential.
--
-- THE STANDARD: OWASP ASVS 5.0 V6.6.2 -- "out-of-band authentication requests, codes, or tokens are
-- bound to the original authentication request for which they were generated." NIST SP 800-63B
-- §5.1.3 frames the same requirement as binding the secret to the authentication operation.
--
-- STAGING (owner instruction -- email_challenges is a hot table read by all 8 flows; a single
-- big-bang cutover risks breaking clinic invites/signup/registration all at once):
--   step 1 (this migration): add `purpose`, NULLABLE, no enforcement. Every existing row and every
--     in-flight caller keeps working unchanged.
--   step 2 (this migration + emailAuth.ts): every one of the 8 writers now populates purpose, via a
--     NEW, minimal `email_auth_set_email_challenge_purpose` accessor called immediately after
--     `app.email_auth_insert_email_challenge` creates the row -- NOT by widening that existing 4-arg
--     function's signature. That signature is pinned by exact arg-type list across
--     deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql's GRANT/REVOKE lines (and the
--     matching check-saas-d3-4-bootstrap-base-login-grants.mjs); changing its arity would make every
--     one of those lines resolve to a function that no longer exists under that signature, FATAL on
--     the next deploy -- exactly the "resurrection" class of mistake this series already hit once
--     (see step 1's fix to deploy/postgres/organization-member-invites-rls.sql). In-flight codes
--     minted before this step still carry NULL purpose.
--   step 3 (this migration): consume-time enforcement, on both engines that were missing it.
--     - Engine A, `app.email_otp_public_consume_latest_challenge` (unauthenticated public OTP): its
--       (text, text) signature is ALSO pinned the same way (same bootstrap grants file, lines
--       ~224/461, plus the dedicated contract test
--       pgEmailOtpPublicAtomicConsume.contract.test.ts), so this migration changes only the
--       FUNCTION BODY, never the signature. It now requires the challenge's purpose to be one of
--       the three purposes that legitimately share this one anonymous confirm endpoint: 'login' and
--       'public_registration' (POST /api/auth/email-otp/confirm serves both login and the
--       completion of public patient registration through the exact same anonymous confirm call,
--       with no way to distinguish them at this layer) and 'clinic_invite' (POST
--       /api/clinic/invites/accept/confirm also calls this same function for the same reason).
--       KNOWN RESIDUAL GAP -- called out for the owner rather than silently patched over: this
--       body-only change cannot yet stop a 'login' code from being redeemed at the clinic-invite
--       endpoint, or a 'clinic_invite' code from being redeemed at the login endpoint, because both
--       confirm routes call this exact function with no route-identifying argument. Closing that
--       would require widening this pinned 2-arg signature, which this migration deliberately does
--       not do. Flagged in the C-2 step 4 worker report as a decision for the owner, not silently
--       expanded scope.
--     - Engine B (the generic `email_auth_find_email_challenge_for_confirm` / `_for_consume` /
--       `_find_latest_email_challenge_for_user` / `_find_latest_pending_email_challenge_for_user`
--       accessors, used by the remaining 6 authenticated-ish flows): each now also returns
--       `purpose`. Their ARGUMENT signature is unchanged -- only RETURNS TABLE's column list grows,
--       which requires DROP + CREATE (CREATE OR REPLACE refuses a return-type change) but does NOT
--       require touching any GRANT/REVOKE line anywhere, because Postgres resolves GRANT/REVOKE ON
--       FUNCTION by name + argument types only, never by return columns. Enforcement itself happens
--       in the TypeScript layer (modules/auth/emailAuth.ts:verifyChallengeCodeRow), which every one
--       of confirmEmailChallenge / consumeEmailChallengeCode / confirmLatestEmailChallengeCodeForUser
--       / consumeLatestEmailChallengeCodeForUser now routes through with an explicit expected
--       purpose supplied by its own caller.
--   step 4 (NOT NULL) -- deliberately NOT done here. Owner instruction: stop after step 2/3 if
--     confidence or budget runs out; a half-landed purpose binding that still accepts everything is
--     strictly better than one that locks real users out of an in-flight clinic invite.
--
-- NULL-PURPOSE TRANSITION RULE (explicit, both engines): a NULL purpose is treated as "legacy,
-- accept once" for the remainder of that row's 10-minute TTL -- i.e. `purpose IS NULL OR purpose =
-- <expected>` (engine B) / `purpose IS NULL OR purpose = ANY(<allowed>)` (engine A). Rejecting NULL
-- immediately would invalidate every code already sitting in a real inbox the instant this migration
-- runs. Every row written from the moment step 2's code deploys carries a non-NULL purpose, so the
-- NULL branch only ever matches rows minted before this migration -- and only for their own
-- already-short remaining lifetime.
--
-- UNIFORM RESPONSE (ASVS 6.3.8): a purpose mismatch is folded into the EXACT SAME branch as a wrong
-- code hash -- same attempts increment, same 'invalid_code'/'too_many_attempts' result, same shape.
-- It must never look different from an ordinary bad guess, or the response itself would leak that a
-- code exists for a different purpose.
--
-- Resurrection check: deploy/postgres/organization-member-invites-rls.sql re-applies a fixed list of
-- email_auth_*/email_otp_public_* functions, including every one touched here, on every deploy (the
-- exact class of bug step 1 already hit once). That overlay moves in the SAME commit as this
-- migration.

ALTER TABLE public.email_challenges ADD COLUMN IF NOT EXISTS purpose text;

ALTER TABLE public.email_challenges
  ADD CONSTRAINT email_challenges_purpose_known_check CHECK (
    purpose IS NULL OR purpose IN (
      'login',
      'public_registration',
      'clinic_invite',
      'specialist_signup',
      'password_reset',
      'password_setup',
      'password_register',
      'email_verify',
      'patient_email_change'
    )
  );

-- Step 2: minimal, additive accessor -- see header for why this is a NEW function rather than
-- widening the existing app.email_auth_insert_email_challenge(uuid,text,text,bigint). Callers insert
-- the challenge exactly as before, then immediately stamp its purpose with this second call, in the
-- same request.
CREATE FUNCTION app.email_auth_set_email_challenge_purpose(
  p_challenge_id uuid,
  p_purpose text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  UPDATE public.email_challenges SET purpose = p_purpose WHERE id = p_challenge_id
$function$;

COMMENT ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) IS
  'C-2 step 4: stamps the purpose (login/public_registration/clinic_invite/specialist_signup/password_reset/password_setup/password_register/email_verify/patient_email_change) an email challenge was minted for, immediately after app.email_auth_insert_email_challenge creates it. A NEW accessor rather than widening insert''s signature -- that 4-arg signature is pinned across deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql.';

DO $email_auth_set_purpose_owner$
BEGIN
  -- Same guarded ownership transfer as 0245/0247/0248: a database that never provisioned the
  -- runtime roles (local dev box, CI scratch DB) still applies this migration instead of
  -- hard-failing the whole chain on a role it does not have.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0249: role app_owner absent; email_auth_set_email_challenge_purpose keeps the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0249: % is not a member of app_owner; email_auth_set_email_challenge_purpose keeps the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) OWNER TO app_owner;
  END IF;
END
$email_auth_set_purpose_owner$;

REVOKE ALL ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) FROM PUBLIC;

DO $email_auth_set_purpose_grants$
BEGIN
  -- Same grantee class as every other app.email_auth_* accessor (app_patient only).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) TO app_patient;
  END IF;
END
$email_auth_set_purpose_grants$;

-- Step 3, engine B: add `purpose` to each accessor's output. Argument signature is unchanged, so no
-- GRANT/REVOKE line anywhere needs to move. DROP + CREATE (not CREATE OR REPLACE) because
-- RETURNS TABLE's column list is changing, which OR REPLACE refuses.
DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_confirm(uuid, uuid);

CREATE FUNCTION app.email_auth_find_email_challenge_for_confirm(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$function$;

DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_consume(uuid, uuid);

CREATE FUNCTION app.email_auth_find_email_challenge_for_consume(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$function$;

DROP FUNCTION IF EXISTS app.email_auth_find_latest_email_challenge_for_user(uuid, bigint);

CREATE FUNCTION app.email_auth_find_latest_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$function$;

DROP FUNCTION IF EXISTS app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint);

CREATE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$function$;

DO $email_auth_purpose_accessor_owner$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0249: role app_owner absent; email_auth purpose-aware accessors keep the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0249: % is not a member of app_owner; email_auth purpose-aware accessors keep the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) OWNER TO app_owner;
    ALTER FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) OWNER TO app_owner;
  END IF;
END
$email_auth_purpose_accessor_owner$;

REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) FROM PUBLIC;

DO $email_auth_purpose_accessor_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) TO app_patient;
  END IF;
END
$email_auth_purpose_accessor_grants$;

-- Step 3, engine A: body-only change. Signature and RETURNS TABLE columns are both unchanged (see
-- header for why), so CREATE OR REPLACE applies cleanly and preserves the existing OWNER/REVOKE/
-- GRANT state from 0232 untouched.
CREATE OR REPLACE FUNCTION app.email_otp_public_consume_latest_challenge(
  p_email_normalized text,
  p_code_hash text
)
RETURNS TABLE (
  ok boolean,
  code text,
  user_id uuid,
  retry_after_seconds integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_email_normalized text := lower(btrim(p_email_normalized));
  v_now_sec bigint := extract(epoch FROM clock_timestamp())::bigint;
  v_challenge public.email_challenges%ROWTYPE;
  v_latest_challenge_id uuid;
  v_target_user public.platform_users%ROWTYPE;
  v_conflict_user_id uuid;
  v_next_attempts integer;
  -- C-2 step 4: the three purposes that legitimately share this one anonymous confirm engine (see
  -- migration header for the residual login-vs-clinic_invite gap this does NOT yet close).
  v_allowed_purposes CONSTANT text[] := ARRAY['login', 'public_registration', 'clinic_invite'];
BEGIN
  IF v_email_normalized = '' THEN
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF p_code_hash IS NULL OR btrim(p_code_hash) = '' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  -- Lock every existing candidate principal in a stable order before taking a
  -- challenge row lock. The email challenge set is bounded by resend replacement.
  PERFORM 1
  FROM public.platform_users AS candidate
  WHERE candidate.id IN (
    SELECT challenge.user_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
  )
  ORDER BY candidate.id
  FOR UPDATE;

  -- Lock the exact latest challenge and then re-read its identity. A concurrent
  -- resend deletes this row before inserting its replacement, so it serializes here.
  LOOP
    SELECT challenge.*
    INTO v_challenge
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
      RETURN;
    END IF;

    SELECT challenge.id
    INTO v_latest_challenge_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1;

    EXIT WHEN v_latest_challenge_id = v_challenge.id;
  END LOOP;

  SELECT platform_user.*
  INTO v_target_user
  FROM public.platform_users AS platform_user
  WHERE platform_user.id = v_challenge.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_user.merged_into_id IS NOT NULL THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.attempts >= 5 THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
    RETURN;
  END IF;

  -- C-2 step 4 (OWASP ASVS V6.6.2 / NIST SP 800-63B §5.1.3): a purpose mismatch is folded into the
  -- EXACT SAME branch as a wrong code hash below -- same attempts increment, same result, same
  -- shape (ASVS 6.3.8 uniform response). NULL purpose (pre-migration rows) is grandfathered in.
  IF v_challenge.code_hash <> p_code_hash
     OR NOT (v_challenge.purpose IS NULL OR v_challenge.purpose = ANY(v_allowed_purposes))
  THEN
    UPDATE public.email_challenges
    SET attempts = attempts + 1
    WHERE id = v_challenge.id
    RETURNING attempts::integer INTO v_next_attempts;

    IF v_next_attempts >= 5 THEN
      DELETE FROM public.email_challenges WHERE id = v_challenge.id;
      RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT conflict.id
  INTO v_conflict_user_id
  FROM public.platform_users AS conflict
  WHERE conflict.email_normalized = v_email_normalized
    AND conflict.merged_into_id IS NULL
    AND conflict.id <> v_target_user.id
  ORDER BY conflict.id
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.platform_users
  SET email = v_email_normalized,
      email_normalized = v_email_normalized,
      email_verified_at = clock_timestamp()
  WHERE id = v_target_user.id;

  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$function$;
