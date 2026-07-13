-- R1 clinic member invites RLS/grants overlay.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/organization-member-invites-rls.sql
--
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v organization_member_invites_down=1 -f deploy/postgres/organization-member-invites-rls.sql
--
-- This file intentionally contains no connection strings. Operators provide the approved TEST/prod
-- connection context. It does not grant BYPASSRLS and does not weaken existing tables.

\set ON_ERROR_STOP on
\pset pager off

\if :{?organization_member_invites_down}
\else
\set organization_member_invites_down 0
\endif

SELECT 1 / (:'organization_member_invites_down' IN ('0', '1'))::int
  AS organization_member_invites_down_is_valid;

BEGIN;

\if :organization_member_invites_down
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
ALTER TABLE "public"."organization_member_invites" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_member_invites" DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" FROM app_staff;
  END IF;
END $$;
\else
ALTER TABLE "public"."organization_member_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_member_invites" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites"
  FOR ALL
  USING (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" TO app_staff;
  END IF;
END $$;
\endif

COMMIT;

\if :organization_member_invites_down
\echo 'organization_member_invites RLS/grants DOWN complete.'
\else
\echo 'organization_member_invites RLS/grants UP complete.'
\endif
