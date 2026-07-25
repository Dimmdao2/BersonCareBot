-- 0239: platform_users.sessions_valid_from — owner-approved S2 security remedy.
-- Authority: docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md, section "S2 — session cookie and
-- revocation" + "S2 — INDEPENDENT AUDIT VERDICT" + "Proposed remedy for owner triage".
--
-- ROOT CAUSE (confirmed by an independent adversarial audit, not re-litigated here): a session
-- carries no server-side identity, so nothing can be revoked and nothing bounds its life.
--   * Logout only cleared the client cookie (never touched the DB).
--   * The only existing revocation column, staff_security_profiles.session_version, is STAFF-ONLY
--     and had ZERO rows for all 281 platform_users on TEST, so app.revoke_staff_sessions() raised
--     staff_security_profile_missing for every current user, and password reset's
--     `if (security) revokeSessions()` silently revoked nothing for the same reason.
--   * platform_users.is_archived was not checked in the session path.
--   * The proxy's sliding renewal (`applySessionRenewalToResponse`) did no DB/version check at all,
--     and preserved `issuedAt` forever, so a copied cookie replayed at least once per TTL window
--     stayed valid indefinitely — for staff and patients alike.
--
-- FIX — one timestamp, one chokepoint. Every session whose cookie `issuedAt` (unix seconds) is
-- EARLIER than this instant is dead; checked in modules/auth/service.ts right beside the existing
-- securityVersion comparison. NULL = no cutoff. This covers PATIENTS too, which the staff-only
-- staff_security_profiles mechanism structurally cannot.
--
-- Owner ruling (2026-07-25, "выкатке разлогинить всех можно"): every EXISTING row gets a cutoff of
-- "now" below, so this migration signs every current session out exactly once, on deploy. New rows
-- created after this migration get NULL (no cutoff) until something actually revokes them.
ALTER TABLE public.platform_users
  ADD COLUMN IF NOT EXISTS sessions_valid_from timestamptz;

UPDATE public.platform_users
SET sessions_valid_from = now()
WHERE sessions_valid_from IS NULL;

-- No index: the only read is by primary key (`platform_users_pkey`, already indexed) — the column
-- is never filtered or sorted on directly, so this is not a "hot column" in the sense of
-- .cursor/rules/db-migrations-hot-column-indexes.mdc.

-- No GRANT change: app_staff already holds unrestricted table-level SELECT/INSERT/UPDATE/DELETE on
-- platform_users (deploy/postgres/p0-5b-grants.sql, p0_5b_staff_grant_tables), which covers this new
-- column automatically — staff-initiated writers (archive, role change) need nothing extra.
-- app_patient holds only whole-table SELECT on platform_users (same file, p0_5b_patient_grant_tables,
-- privileges='SELECT') and NO table-level UPDATE
-- (deploy/postgres/e1-webapp-runtime-config.sql asserts
-- `NOT has_table_privilege('app_patient','public.platform_users','UPDATE')`), so a patient
-- self-write (logout, password reset) cannot be a raw UPDATE under app_patient — that would need a
-- new column grant and would break the e1 assert / deploy gate built on it. The function below
-- mirrors the EXISTING established seam for exactly this shape of write:
--   * app.revoke_staff_sessions() / app.confirm_staff_recovery_codes() etc. (0215) — SECURITY
--     DEFINER, self-scoped via app.require_staff_security_self_user_id(), EXECUTE granted to
--     app_patient only (identity-self operations run under the app_patient DB role/GUC regardless
--     of the caller's application role — see
--     apps/webapp/src/app-layer/principal/staffSecuritySelfPrincipal.ts).
--   * app.set_current_patient_calendar_timezone (0202) — same shape, a raw UPDATE on
--     platform_users from inside a SECURITY DEFINER body owned by app_owner (which already owns
--     the table), needing no additional GRANT restatement.
CREATE OR REPLACE FUNCTION app.stamp_platform_user_sessions_valid_from_self()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	UPDATE public.platform_users
	SET sessions_valid_from = now(), updated_at = now()
	WHERE id = app.require_staff_security_self_user_id()
$$;

REVOKE ALL ON FUNCTION app.stamp_platform_user_sessions_valid_from_self() FROM PUBLIC;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
		GRANT EXECUTE ON FUNCTION app.stamp_platform_user_sessions_valid_from_self() TO app_patient;
	END IF;
END
$$;

-- Safe rollback / degradation contract:
--   * application rollback leaves this column dormant: nothing reads it unless
--     modules/auth/service.ts's chokepoint runs, and a NULL/missing value is always treated as "no
--     cutoff" (fail-open on THIS column specifically — the existing securityVersion check next to
--     it stays the fail-closed backstop it already was).
--   * destructive removal (DROP COLUMN) is a separate, explicitly owner-authorized migration.
--   * re-adding a raw table/column GRANT for app_patient UPDATE on platform_users instead of using
--     this accessor is forbidden — see the e1 assert above.
