-- 0244: platform_users.session_epoch — THE session-revocation mechanism (there is now exactly one).
-- Authority: docs/_TODO/NIGHT_PLAN_2026-07-26.md item C-1 (owner-approved: staff idle 12 h /
-- patient idle 30 d, absolute ceiling 7 d / 90 d, plus a one-time forced global sign-out at
-- cutover). This replaces 0239's `sessions_valid_from` timestamp, which is dropped at the bottom.
--
-- WHY A COUNTER AND NOT A TIMESTAMP (D3).
-- 0239 revoked by comparing the cookie's `issuedAt` (written by the Node process) against
-- `platform_users.sessions_valid_from` (written by Postgres `now()`). An independent adversarial
-- audit reproduced BOTH directions of that clock mix on a live database:
--   * DB clock behind  -> a cookie issued BEFORE the revocation still passed (revocation missed);
--   * DB clock ahead   -> a brand-new cookie minted right after a password reset was rejected
--                         (legitimate users locked out; indistinguishable from "login is broken").
-- A one-directional skew allowance narrows that window; it does not remove the class. A counter
-- compared for EQUALITY removes clocks from the revocation decision entirely. Timestamps survive
-- ONLY where both sides are the app clock (idle TTL and absolute ceiling, both `issuedAt` vs
-- `Date.now()` in modules/auth/sessionCookie.ts). No app value is ever compared to a DB value.
-- OWASP ASVS 5.0 V7.4.1 sanctions either shape — "disallowing tokens produced before a per-user
-- date and time" is one option, not the only one — so the counter is a conforming choice.
--
-- WHY THIS IS "EXTEND THE EXISTING MECHANISM", NOT A SECOND ONE.
-- The counter pattern is not new here: `staff_security_profiles.session_version` (0215) is already
-- a per-user monotonic counter, carried in the session as `SessionUser.securityVersion` and
-- equality-compared at the same chokepoint in modules/auth/service.ts. This migration RE-HOMES that
-- established mechanism onto the row that covers BOTH audiences, because the staff table
-- structurally cannot:
--   * it is the staff MFA table (TOTP ciphertext, recovery-code hashes, lockout counters); a row
--     exists only after staff factor enrollment. On TEST that was ZERO rows for all 281
--     platform_users, so app.revoke_staff_sessions() raised `staff_security_profile_missing` for
--     every current user and revoked nothing;
--   * giving every patient a staff-security profile just to own a counter would put patients into
--     the staff factor surface.
-- `platform_users` is the row the session path ALREADY re-reads on every request
-- (pgUserByPhone.findByUserId), so the counter costs no additional query.
-- The application half renames the session field `securityVersion` -> `sessionEpoch` and reads it
-- from this column; there is exactly one comparison left in the codebase.
--
-- ONE MECHANISM, NOT TWO. `staff_security_profiles.session_version` is not deleted (it is genuine
-- MFA bookkeeping and is returned by 0215's accessors), but it stops being an authority: the
-- trigger below makes every bump of it — by any present or future writer — increment
-- `platform_users.session_epoch`. After this migration exactly one value is compared at the
-- session chokepoint, and `grep -rn "securityVersion\|sessions_valid_from" apps/webapp/src` is empty.

-- DEFAULT 1, not 0: an absent/zero value can then never be mistaken for a live epoch. Combined
-- with the cookie-shape validation added in the same commit (a decoded cookie with a missing or
-- non-numeric `sessionEpoch` is rejected outright), this makes "the field was not carried" a
-- rejection rather than a silent `?? 0` match — which is exactly how the old `securityVersion`
-- check passed for every user who had no staff_security_profiles row.
ALTER TABLE public.platform_users
  ADD COLUMN IF NOT EXISTS session_epoch integer DEFAULT 1 NOT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'platform_users_session_epoch_check'
		  AND conrelid = 'public.platform_users'::regclass
	) THEN
		ALTER TABLE public.platform_users
			ADD CONSTRAINT platform_users_session_epoch_check CHECK (session_epoch >= 1);
	END IF;
END
$$;

-- THE ONE-TIME FORCED GLOBAL SIGN-OUT (owner ruling 2026-07-25, «выкатке разлогинить всех можно»)
-- needs no data statement here, and deliberately has none. Every cookie minted before this deploy
-- carries `securityVersion`, never `sessionEpoch`; the new chokepoint rejects any DB-backed session
-- whose cookie has no `sessionEpoch`. So the cutover signs everybody out exactly once, by
-- construction, and is idempotent under a re-applied migration — unlike a `SET ... = ... + 1`
-- statement, which would sign everybody out a second time if the drizzle journal watermark
-- re-ran this file (a failure mode this repo has actually shipped).

-- Self-scoped increment. Same seam as 0239's stamp function and as
-- app.set_current_patient_calendar_timezone (0202): SECURITY DEFINER owned by the table owner,
-- scoped by app.require_staff_security_self_user_id(), EXECUTE granted to app_patient only.
-- app_patient deliberately holds NO table-level UPDATE on platform_users
-- (deploy/postgres/e1-webapp-runtime-config.sql asserts it), so a patient self-revocation
-- (logout, password reset, "sign out everywhere") must go through an accessor like this one.
CREATE OR REPLACE FUNCTION app.bump_platform_user_session_epoch_self()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_session_epoch integer;
BEGIN
	UPDATE public.platform_users
	SET session_epoch = session_epoch + 1, updated_at = now()
	WHERE id = app.require_staff_security_self_user_id()
	RETURNING session_epoch INTO v_session_epoch;
	IF v_session_epoch IS NULL THEN
		RAISE EXCEPTION 'platform_user_missing';
	END IF;
	RETURN v_session_epoch;
END
$$;

REVOKE ALL ON FUNCTION app.bump_platform_user_session_epoch_self() FROM PUBLIC;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
		GRANT EXECUTE ON FUNCTION app.bump_platform_user_session_epoch_self() TO app_patient;
	END IF;
END
$$;

-- Every writer of `staff_security_profiles.session_version` (0215: app.revoke_staff_sessions,
-- app.complete_staff_totp_enrollment, app.consume_staff_recovery_login, and anything added later)
-- feeds the single counter through this trigger. A trigger rather than re-authoring those function
-- bodies: the bodies carry the MFA logic, copying them here to add one statement would duplicate
-- ~60 lines of security-sensitive SQL and would silently miss any future writer. Triggers are an
-- established mechanism in these migrations (0186, 0193, 0209, 0210, 0217, 0218, 0225, 0238).
--
-- SECURITY DEFINER on purpose, owned by the same role that owns the table: the triggering
-- statement can come from a SECURITY DEFINER MFA function (whose owner may update platform_users)
-- OR from app_staff directly, and the trigger must succeed identically in both cases. Making it
-- depend on the invoker's rights would turn a privilege difference into a silently missed
-- revocation, which is the exact class of bug this migration exists to remove.
CREATE OR REPLACE FUNCTION app.propagate_staff_session_version_to_session_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE public.platform_users
	SET session_epoch = session_epoch + 1, updated_at = now()
	WHERE id = NEW.user_id;
	RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.propagate_staff_session_version_to_session_epoch() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_staff_session_version_to_session_epoch ON public.staff_security_profiles;
CREATE TRIGGER trg_staff_session_version_to_session_epoch
AFTER UPDATE OF session_version ON public.staff_security_profiles
FOR EACH ROW
WHEN (NEW.session_version IS DISTINCT FROM OLD.session_version)
EXECUTE FUNCTION app.propagate_staff_session_version_to_session_epoch();

-- The 0239 mechanism is removed in full: its writer first (a granted SECURITY DEFINER writer left
-- behind is a second live revocation path), then the column. Nothing reads either after the
-- application change that lands with this migration — the chokepoint, the archive writer
-- (pgDoctorClients.setUserArchived) and the role-change writer (pgUserProjection.updateRole) all
-- move to `session_epoch` in the same commit. 0239 never reached production, so on PROD this drop
-- is a no-op.
DROP FUNCTION IF EXISTS app.stamp_platform_user_sessions_valid_from_self();

ALTER TABLE public.platform_users
  DROP COLUMN IF EXISTS sessions_valid_from;

-- No index: the only read is by primary key (`platform_users_pkey`); the column is never filtered
-- or sorted on — same reasoning as 0239, see .cursor/rules/db-migrations-hot-column-indexes.mdc.
-- No GRANT change for staff writers: app_staff already holds unrestricted table-level
-- SELECT/INSERT/UPDATE/DELETE on platform_users (deploy/postgres/p0-5b-grants.sql,
-- p0_5b_staff_grant_tables), which covers a new column automatically.
--
-- DEPLOY / BOOT COUPLING (D1). Code live + this migration not applied used to mean EVERY session
-- was rejected, including brand-new logins, with nothing asserting the schema. Two guards land with
-- this file, both following patterns this repo already uses:
--   * deploy/host/webapp-post-migrate-schema-check.sh gains `platform_users.session_epoch` — the
--     existing post-migrate column guardrail that deploy-prod.sh and deploy-webapp-prod.sh already
--     run after migrate and BEFORE `systemctl restart`; deploy-test-saas.sh's own post-migrate
--     column loop gains the same entry.
--   * apps/webapp/src/instrumentation.ts asserts the column at BOOT (next to the existing
--     assertDevAuthBypassConfiguration / DATABASE_URL assertions), so a webapp started against a
--     behind schema refuses to start instead of 401-ing every request.
