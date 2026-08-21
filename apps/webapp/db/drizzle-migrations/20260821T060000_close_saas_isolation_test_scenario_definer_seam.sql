-- BCB-MIGRATION-OWNER: saas_telemetry_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_saas_isolation_test_scenario_fixture_counts()') IS NULL AND to_regprocedure('app.set_saas_isolation_test_scenario(text)') IS NULL
--
-- ce5d5cccf retired the live DEV/TEST fixture machinery (installer, declarations, privileges) but
-- left no B0-forward migration for the two SECURITY DEFINER functions that installer had already
-- put on the applied TEST catalog. deploy-test's reconcile-access function census failed closed on
-- exactly these two: `app.read_saas_isolation_test_scenario_fixture_counts()` and
-- `app.set_saas_isolation_test_scenario(text)`, both owned by `saas_telemetry_owner`. This closes
-- that catalog drop; no replacement fixture mechanism is added.

DROP FUNCTION IF EXISTS app.read_saas_isolation_test_scenario_fixture_counts();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: saas_telemetry_owner
DROP FUNCTION IF EXISTS app.set_saas_isolation_test_scenario(text);
