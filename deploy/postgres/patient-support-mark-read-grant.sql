-- Patient support mark-read column grant (defect fix: patient mark-read HTTP 500 / SQLSTATE 42501).
--
-- Context / defect:
--   apps/webapp/src/infra/repos/pgSupportCommunication.ts (markInboundReadForUser,
--   markInboundMessagesReadForUser, markNotificationMessagesReadForUser) runs a direct
--   `UPDATE support_conversation_messages SET read_at = COALESCE(read_at, now()) ...` under the
--   app_patient webapp DB role. deploy/postgres/p0-5b-grants.sql:373 grants app_patient only
--   `SELECT, INSERT` on that table -> PostgreSQL aclcheck_error (SQLSTATE 42501) -> HTTP 500.
--   The SEND path already works because app_patient holds the whole-table INSERT grant; the
--   mark-read (UPDATE) path was never granted.
--
-- Fix pattern (mirrors the established narrowed-grant pattern, NOT a SECURITY DEFINER wrapper):
--   The patient write surface uses whole-table grants (p0-5b-grants.sql) layered with column-level
--   GRANTs (p0-5b-grants.sql:469-489, e.g. support_conversations gets
--   `GRANT UPDATE (organization_id, platform_user_id, updated_at) ... TO app_patient`). There is no
--   `app.*_support` SECURITY DEFINER function for the send path. This overlay adds the single missing
--   column-level UPDATE grant so mark-read matches that same proven pattern. The mark-read statements
--   only ever write the `read_at` column, so `UPDATE (read_at)` is the minimal sufficient surface and
--   covers all three mark-read repo methods at once.
--
-- Row scope is enforced by RLS, not by this grant. Policy `saas_org_dormant_p0_8_4` on
-- public.support_conversation_messages (deploy/postgres/phase4-locked-helper-rls-policies.sql:1309-1316)
-- is FOR ALL and its USING + WITH CHECK clauses already restrict a patient to rows whose
-- conversation.platform_user_id = app.current_patient_user_id(). A column-level UPDATE grant can never
-- widen the row set (RLS restricts ROWS, never COLUMNS -- same note as p0-5b-grants.sql:465-467), so a
-- patient can only mark-read messages in their own conversation; cross-user rows remain invisible.
--
-- Dormant boundary (same as p0-5b-grants.sql): this overlay only adds a GRANT to the already-existing
-- app_patient role. It does not change DATABASE_URL, switch any runtime process, or alter RLS.
--
-- No psql variables required (role name is fixed) -- invoke directly:
--   psql '<database-url>' -f deploy/postgres/patient-support-mark-read-grant.sql
--
-- Rollback:
--   Re-run with -v patient_support_mark_read_grant_down=1.

\set ON_ERROR_STOP on
\pset pager off

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')::int AS patient_support_mark_read_role_exists \gset

\if :patient_support_mark_read_role_exists
\else
\echo 'FATAL: app_patient must already exist -- run p0-5b-role-split-staff-patient.sql first.'
SELECT 1 / 0 AS patient_support_mark_read_grant_abort;
\endif

\if :{?patient_support_mark_read_grant_down}
\echo 'Patient support mark-read grant DOWN: revoking UPDATE (read_at) from app_patient.'
REVOKE UPDATE ("read_at") ON TABLE "public"."support_conversation_messages" FROM app_patient;
\echo 'Patient support mark-read grant DOWN complete.'
\else
\echo 'Patient support mark-read grant UP: GRANT UPDATE (read_at) on support_conversation_messages to app_patient.'
GRANT UPDATE ("read_at") ON TABLE "public"."support_conversation_messages" TO app_patient;
\echo 'Patient support mark-read grant UP complete.'
\endif
