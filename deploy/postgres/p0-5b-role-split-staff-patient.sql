-- P0.5b / B4-roles-1 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #662): dormant staff/patient DB
-- role split.
--
-- Purpose:
--   - create the two FIXED, canonical roles the patient-wall RLS predicates now check via
--     app.is_staff() (see apps/webapp/db/drizzle-migrations/0175_p0_8_b4_roles_1_is_staff_wall_rls.sql
--     and docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs renderStaffActorCheck()):
--       * app_staff   — staff/doctor sessions; app.is_staff() returns true for members of this role.
--       * app_patient — patient sessions; NEVER a member of app_staff (see the DOWN-proof assertion
--         below) — this is the actual security boundary the old app.actor='staff' GUC lacked. A
--         session authenticated as app_patient cannot `SET ROLE app_staff` / `SET SESSION
--         AUTHORIZATION app_staff` to escalate itself; Postgres itself rejects that (proven live by
--         named-DEV role-boundary verification).
--   - both roles are LOGIN (capable of being connected to directly once ops provisions a credential
--     — this script does NOT set a password for either role, see "Dormant boundary" below) and
--     NOBYPASSRLS (RLS enforcement applies to them exactly like p0-5-role-split.sql's app role).
--
-- These role NAMES are canonical and FIXED (not psql variables, unlike p0-5-role-split.sql's
-- owner/migrator/app role names) because app.is_staff() hardcodes the literal 'app_staff' — the
-- role this script creates MUST be spelled exactly the same, in exactly one place on each side
-- (this file + the SQL function), never duplicated elsewhere.
--
-- Dormant boundary:
--   - this script does NOT set a password/credential for either role — until ops provisions one in
--     a later, explicitly-gated stage, neither role can actually authenticate over a real client
--     connection (only a superuser session can reach them via SET SESSION AUTHORIZATION, which is
--     exactly how the proof smoke exercises them);
--   - this script does NOT change application DATABASE_URL values or switch any runtime process to
--     either role (that connection-routing wiring is B4-fanout, a separate, owner-gated stage);
--   - this script does NOT grant table-level SELECT/INSERT/UPDATE/DELETE to either role — that is a
--     separate task (B5-v2), tracked apart from this role-membership boundary on purpose so the two
--     concerns (WHO the DB thinks a session is vs. WHAT tables a session may touch) stay decoupled;
--   - this script does not deploy, migrate, or enable new RLS enforcement by itself — RLS is already
--     enabled/forced by the 0169-0175 migrations; this only supplies the roles those policies check.
--
-- No psql variables required (role names are fixed) — invoke directly:
--   psql '<database-url>' -f deploy/postgres/p0-5b-role-split-staff-patient.sql
--
-- Rollback:
--   Re-run with -v p0_5b_down=1. The down block revokes the (deliberately absent) app_staff
--   membership from app_patient defensively, then drops both roles if they own nothing.

\set ON_ERROR_STOP on
\pset pager off

SELECT rolsuper::int AS p0_5b_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_5b_can_manage_roles
\else
\echo 'FATAL: P0.5b role split requires a superuser-capable executor (creates LOGIN roles).'
SELECT 1 / 0 AS p0_5b_abort;
\endif

\if :{?p0_5b_down}
\echo 'P0.5b role split DOWN: dropping app_staff/app_patient when unused.'

REVOKE app_staff FROM app_patient;

SELECT format('DROP ROLE %I', 'app_patient')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
\gexec

SELECT format('DROP ROLE %I', 'app_staff')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
\gexec

\echo 'P0.5b role split DOWN complete.'
\else
\echo 'P0.5b role split UP: creating app_staff / app_patient (no table grants, no credential).'

SELECT format('CREATE ROLE %I LOGIN NOBYPASSRLS', 'app_staff')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
\gexec

SELECT format('CREATE ROLE %I LOGIN NOBYPASSRLS', 'app_patient')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
\gexec

ALTER ROLE app_staff LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE app_patient LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Defensive: an app_patient that somehow already had app_staff membership (e.g. a hand-run GRANT
-- before this script existed) would silently defeat the whole point of this role split. Revoking
-- unconditionally here is idempotent (REVOKE of a membership that does not exist is a no-op) and
-- guarantees the invariant this migration exists to prove, regardless of prior manual state.
REVOKE app_staff FROM app_patient;

SELECT (
  rolcanlogin = true AND rolsuper = false AND rolcreatedb = false
  AND rolcreaterole = false AND rolreplication = false AND rolbypassrls = false
)::int AS p0_5b_app_staff_safe_ok
FROM pg_roles WHERE rolname = 'app_staff' \gset

\if :p0_5b_app_staff_safe_ok
\else
\echo 'FATAL: P0.5b app_staff must be LOGIN, non-superuser, non-createrole, and NOBYPASSRLS.'
SELECT 1 / 0 AS p0_5b_abort;
\endif

SELECT (
  rolcanlogin = true AND rolsuper = false AND rolcreatedb = false
  AND rolcreaterole = false AND rolreplication = false AND rolbypassrls = false
)::int AS p0_5b_app_patient_safe_ok
FROM pg_roles WHERE rolname = 'app_patient' \gset

\if :p0_5b_app_patient_safe_ok
\else
\echo 'FATAL: P0.5b app_patient must be LOGIN, non-superuser, non-createrole, and NOBYPASSRLS.'
SELECT 1 / 0 AS p0_5b_abort;
\endif

-- THE security-boundary assertion this whole file exists for: app_patient must NEVER be (directly
-- or indirectly, through any chain of intermediary role grants) a member of app_staff. If this ever
-- fails, app.is_staff() -- which calls pg_has_role(current_user, 'app_staff', 'MEMBER') -- would
-- return true for a patient session and the entire B4-roles-1 fix would be silently defeated.
--
-- MUST use pg_has_role(...) here, NOT a raw one-hop pg_auth_members lookup. pg_has_role follows the
-- FULL transitive membership chain (exactly like app.is_staff() itself does), so it also catches
-- e.g. app_patient -> some_intermediary_role -> app_staff, which a direct pg_auth_members row check
-- would miss (it only sees a DIRECT app_patient->app_staff grant and passes even though is_staff()
-- would still return true for an app_patient session). Live-proven, scratch DB only, 2026-07-11:
-- building that exact chain (app_patient MEMBER OF intermediary; intermediary MEMBER OF app_staff)
-- made the old one-hop query report "ok" while pg_has_role('app_patient', 'app_staff', 'MEMBER')
-- correctly returned true -- this assertion must match what app.is_staff() actually evaluates, or it
-- proves nothing about the real bypass check.
SELECT (NOT pg_has_role('app_patient', 'app_staff', 'MEMBER'))::int AS p0_5b_patient_not_staff_ok \gset

\if :p0_5b_patient_not_staff_ok
\else
\echo 'FATAL: P0.5b app_patient must NOT be a member of app_staff (directly or transitively).'
SELECT 1 / 0 AS p0_5b_abort;
\endif

\echo 'P0.5b role split UP complete: app_staff + app_patient exist, NOBYPASSRLS, no cross-membership, no table grants (B5-v2), no credential.'
\endif
