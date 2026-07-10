-- P0.5.1 scratch proof: migrator/owner role split plus non-bypass app role.
-- This script is intentionally synthetic and transactional. It must not run on dev/prod PII databases.

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_5_scratch_db_ok \gset

\if :p0_5_scratch_db_ok
\else
\echo 'FATAL: P0.5.1 role proof must run only on a scratch/SaaS proof database.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SELECT (rolsuper OR rolcreaterole)::int AS p0_5_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_5_can_manage_roles
\else
\echo 'FATAL: P0.5.1 role proof requires a scratch role with CREATEROLE or superuser privileges.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SELECT
  'p0_5_role_split_owner_' || pg_backend_pid() AS p0_5_owner_role,
  'p0_5_role_split_migrator_' || pg_backend_pid() AS p0_5_migrator_role,
  'p0_5_role_split_app_' || pg_backend_pid() AS p0_5_app_role \gset

BEGIN;

DROP SCHEMA IF EXISTS p0_5_role_split_proof CASCADE;

CREATE ROLE :"p0_5_owner_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_5_migrator_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_5_app_role" NOLOGIN NOBYPASSRLS;

CREATE SCHEMA p0_5_role_split_proof AUTHORIZATION :"p0_5_owner_role";

CREATE TABLE p0_5_role_split_proof.scoped_rows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  payload text NOT NULL
);

INSERT INTO p0_5_role_split_proof.scoped_rows (id, organization_id, payload)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'org-a row'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'org-b row');

ALTER TABLE p0_5_role_split_proof.scoped_rows OWNER TO :"p0_5_owner_role";
GRANT :"p0_5_owner_role" TO :"p0_5_migrator_role";
GRANT USAGE ON SCHEMA p0_5_role_split_proof TO :"p0_5_app_role";
GRANT SELECT ON TABLE p0_5_role_split_proof.scoped_rows TO :"p0_5_app_role";

ALTER TABLE p0_5_role_split_proof.scoped_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_5_role_split_proof.scoped_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY p0_5_role_split_app_org_policy
ON p0_5_role_split_proof.scoped_rows
FOR SELECT
TO :"p0_5_app_role"
USING (organization_id = NULLIF(current_setting('app.org', true), '')::uuid);

SELECT (NOT rolbypassrls)::int AS p0_5_app_nobypass_ok
FROM pg_roles
WHERE rolname = :'p0_5_app_role' \gset

\if :p0_5_app_nobypass_ok
\else
\echo 'FATAL: app role must be NOBYPASSRLS.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SELECT (
  c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = :'p0_5_app_role')
)::int AS p0_5_app_not_owner_ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'p0_5_role_split_proof'
  AND c.relname = 'scoped_rows' \gset

\if :p0_5_app_not_owner_ok
\else
\echo 'FATAL: app role must not own scoped tables.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SET LOCAL ROLE :"p0_5_app_role";

SELECT set_config('app.org', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT (count(*) = 1 AND min(payload) = 'org-a row')::int AS p0_5_org_a_visible_ok
FROM p0_5_role_split_proof.scoped_rows \gset

\if :p0_5_org_a_visible_ok
\else
\echo 'FATAL: app role did not see exactly the org-a row.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SELECT set_config('app.org', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
SELECT (count(*) = 1 AND min(payload) = 'org-b row')::int AS p0_5_org_b_visible_ok
FROM p0_5_role_split_proof.scoped_rows \gset

\if :p0_5_org_b_visible_ok
\else
\echo 'FATAL: app role did not see exactly the org-b row.'
SELECT 1 / 0 AS p0_5_abort;
\endif

SELECT set_config('app.org', '', true);
SELECT (count(*) = 0)::int AS p0_5_empty_org_denies_ok
FROM p0_5_role_split_proof.scoped_rows \gset

\if :p0_5_empty_org_denies_ok
\else
\echo 'FATAL: empty app.org must deny scoped rows.'
SELECT 1 / 0 AS p0_5_abort;
\endif

RESET ROLE;
ROLLBACK;

\echo 'P0.5.1 role split scratch proof OK.'
