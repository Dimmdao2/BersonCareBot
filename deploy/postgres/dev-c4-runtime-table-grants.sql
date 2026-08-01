-- DEV-only C4: align runtime-role TABLE grants with what deploy/postgres/*.sql declares.
--
-- Why this exists (2026-08-01, see docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md §3a): same class
-- of drift as dev-c3 (app-schema function owners), one door over. TEST runs deploy/postgres/*.sql on
-- every rollout, and several of those overlays GRANT/REVOKE table-level SELECT/INSERT/UPDATE/DELETE
-- for the fixed runtime roles (app_staff, app_patient, app_owner, app_platform_settings,
-- app_clinic_billing). Dev has no equivalent automation, so a hand-seeded/restored dev database
-- drifts: some of these overlays (c5a-platform-operations-runtime.sql in particular) never ran here
-- at all, and a couple of narrower fixes (patient-write-grants-role-pool-mismatch.sql,
-- saas-system-health-diagnostics.sql) only partially landed. Symptom measured 2026-08-01: staff
-- billing (`GET /app/settings?tab=billing`) 500'd with `permission denied for table
-- saas_organization_trials`, then (after the first half of this fix) `permission denied for table
-- saas_billing_subscriptions`.
--
-- Source of truth is exclusively the literal `GRANT/REVOKE ... ON TABLE ...` declarations already
-- committed in deploy/postgres/*.sql (including the FOREACH/EXECUTE format() loop in
-- c5a-platform-operations-runtime.sql's `$c5a_saas_billing_runtime$` block, resolved by hand) --
-- nothing here is guessed. Every row below is traceable to one specific overlay file; see the
-- accompanying report for the full three-way comparison (declared-and-matches /
-- declared-and-mismatched / not declared by anything).
--
-- Deliberately NOT included: tables not declared by an existing overlay. Adding a grant here would
-- invent scope instead of aligning DEV with the committed runtime-grant declarations.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database, after dev-c0/c1/c3
-- and the p0-5b/c5a/saas-system-health-diagnostics/patient-write-grants-role-pool-mismatch overlays
-- that create the target roles and tables.
--
-- Rollback: re-run with the GRANT lines turned into the matching REVOKE (privileges, table, role are
-- all named explicitly below), and REVERSE the one REVOKE (re-`GRANT UPDATE, DELETE ON TABLE
-- public.clinical_test_measure_kinds TO app_staff` if that legacy surface is ever needed back).
--
-- Idempotent: safe to re-run. GRANT/REVOKE are natively idempotent in Postgres; re-running this file
-- against an already-aligned database is a no-op.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C4 runtime-table-grant alignment requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C4 runtime-table-grant alignment requires the exact postgres superuser operator';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_clinic_billing')
  ) THEN
    RAISE EXCEPTION 'DEV C4: one of the five target roles is missing -- run the overlay that creates it first (see header comment)';
  END IF;
END
$guard$;

-- 1. c5a-platform-operations-runtime.sql closure that never ran on dev: app_platform_settings'
--    commercial-administration read/write surface, and app_staff's SELECT-only saas_organization_trials
--    re-grant (dev never had it after the earlier legacy write grant was revoked upstream).
GRANT SELECT ON TABLE public.saas_organization_trials TO app_staff;
GRANT SELECT, UPDATE ON TABLE public.saas_organization_trials TO app_platform_settings; -- INSERT already granted by dev-c3
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_tariffs TO app_platform_settings;
GRANT INSERT, UPDATE ON TABLE public.saas_trial_policy TO app_platform_settings; -- SELECT already granted by dev-c3
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides TO app_platform_settings;
GRANT SELECT ON TABLE public.be_organizations TO app_platform_settings;
GRANT UPDATE (tariff_id, updated_at) ON TABLE public.be_organizations TO app_platform_settings;
GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;
GRANT SELECT ON TABLE
  public.be_branches,
  public.be_specialists,
  public.be_clinic_services,
  public.be_specialist_service_availability,
  public.be_service_location_availability,
  public.be_working_hours
  TO app_platform_settings;

-- 2. c5a's guarded Phase-4 SaaS billing rehydration (saas_billing_accounts/subscriptions/invoices/
--    provider_events): app_platform_settings gets SELECT/INSERT/UPDATE (no DELETE), app_clinic_billing
--    gets SELECT-only. Guarded the same way the source overlay guards it -- some clusters omit
--    migration 0259.
DO $c4_saas_billing_grants$
DECLARE
  relation_names constant text[] := ARRAY[
    'saas_billing_accounts',
    'saas_billing_subscriptions',
    'saas_billing_invoices',
    'saas_billing_provider_events'
  ];
  relation_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(relation_names) AS expected(name)
    WHERE to_regclass('public.' || expected.name) IS NULL
  ) THEN
    RAISE WARNING 'DEV C4: one or more saas_billing_* tables do not exist -- skipping the guarded billing grant closure (matches c5a''s own guard).';
  ELSE
    FOREACH relation_name IN ARRAY relation_names LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_platform_settings', relation_name);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO app_clinic_billing', relation_name);
    END LOOP;
  END IF;
END
$c4_saas_billing_grants$;

-- 3. saas-system-health-diagnostics.sql / patient-media-playback-telemetry-accessors.sql closure for
--    app_owner on media_playback_stats_hourly: dev only had the narrower dev-c3 INSERT.
GRANT SELECT, UPDATE ON TABLE public.media_playback_stats_hourly TO app_owner;

-- 4. c5a's A-6/#1007 write-lock (taskdb #1007): app_staff never had UPDATE/DELETE closed on dev.
--    Guarded exactly like the source overlay -- some clusters omit migration 0034.
DO $c4_clinical_test_measure_kinds_revoke$
BEGIN
  IF to_regclass('public.clinical_test_measure_kinds') IS NULL THEN
    RAISE WARNING 'DEV C4: public.clinical_test_measure_kinds does not exist on this database -- skipping the app_staff UPDATE/DELETE write-lock revoke.';
  ELSE
    REVOKE UPDATE, DELETE ON TABLE public.clinical_test_measure_kinds FROM app_staff;
  END IF;
END
$c4_clinical_test_measure_kinds_revoke$;

-- 5. patient-write-grants-role-pool-mismatch.sql: two of its six app_patient column grants never
--    landed on dev (the other four already matched).
GRANT UPDATE ("content_page_id", "updated_at", "last_rotation_at", "skip_next_scheduled_rotation")
  ON TABLE public.patient_daily_warmup_presentations TO app_patient;
GRANT UPDATE ("feeling") ON TABLE public.patient_practice_completions TO app_patient;

DO $assertions$
BEGIN
  IF NOT has_table_privilege('app_staff', 'public.saas_organization_trials', 'SELECT')
     OR NOT has_table_privilege('app_platform_settings', 'public.saas_organization_trials', 'UPDATE')
     OR NOT has_table_privilege('app_platform_settings', 'public.saas_tariffs', 'INSERT')
     OR NOT has_table_privilege('app_platform_settings', 'public.saas_org_entitlement_overrides', 'DELETE')
     OR NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'SELECT')
     OR (
       to_regclass('public.saas_billing_subscriptions') IS NOT NULL
       AND NOT has_table_privilege('app_clinic_billing', 'public.saas_billing_subscriptions', 'SELECT')
     )
     OR NOT has_table_privilege('app_owner', 'public.media_playback_stats_hourly', 'SELECT')
     OR (
       to_regclass('public.clinical_test_measure_kinds') IS NOT NULL
       AND has_table_privilege('app_staff', 'public.clinical_test_measure_kinds', 'UPDATE')
     )
     OR NOT has_column_privilege('app_patient', 'public.patient_practice_completions', 'feeling', 'UPDATE')
  THEN
    RAISE EXCEPTION 'DEV C4 runtime-table-grant alignment did not fully take effect';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C4 runtime-table-grant alignment: OK'
