#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  renderP013SyntheticFixtureCompatSchemaSql,
  renderP013SyntheticFixtureScratchSql,
  syntheticFixtureIds,
  syntheticIntegratorUserIds,
} from './p0-13-synthetic-fixtures.mjs';

const repoRoot = process.cwd();
const dbName = `bcb_saas_p0_13_2_scratch_${process.pid}_${Date.now()}`;
const appRole = `p0_13_2_app_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status ?? 'unknown status'}`,
    );
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(sql, database = dbName) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    input: sql,
  });
}

const appRoleIdent = quoteIdent(appRole);
const orgA = syntheticFixtureIds.orgA;
const orgB = syntheticFixtureIds.orgB;
const patientA1 = syntheticFixtureIds.patientA1;
const patientA2 = syntheticFixtureIds.patientA2;
const patientB1 = syntheticFixtureIds.patientB1;

const isolationSql = String.raw`
\set ON_ERROR_STOP on

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_13_2_scratch_db_ok \gset

\if :p0_13_2_scratch_db_ok
\else
\echo 'FATAL: P0.13.2 isolation smoke must run only on a scratch/SaaS proof database.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (current_database() ~ 'bcb_webapp_(dev|prod|test)')::int AS p0_13_2_runtime_db \gset
\if :p0_13_2_runtime_db
\echo 'FATAL: P0.13.2 isolation smoke refuses dev/prod/test application databases.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

CREATE ROLE ${appRoleIdent} NOLOGIN NOBYPASSRLS;

CREATE SCHEMA p0_13_isolation;
CREATE TABLE p0_13_isolation.infra_rows (id uuid PRIMARY KEY, payload text NOT NULL);
CREATE TABLE p0_13_isolation.telemetry_rows (id uuid PRIMARY KEY, payload text NOT NULL);
CREATE TABLE p0_13_isolation.legacy_rows (id uuid PRIMARY KEY, payload text NOT NULL);

INSERT INTO p0_13_isolation.infra_rows VALUES (md5('p0.13.2 infra')::uuid, 'infra');
INSERT INTO p0_13_isolation.telemetry_rows VALUES (md5('p0.13.2 telemetry')::uuid, 'telemetry');
INSERT INTO p0_13_isolation.legacy_rows VALUES (md5('p0.13.2 legacy')::uuid, 'legacy');

GRANT USAGE ON SCHEMA public, integrator, p0_13_fixture, p0_13_isolation TO ${appRoleIdent};
GRANT SELECT ON
  public.be_organization_members,
  public.org_enrollments,
  public.be_subscription_packages,
  public.be_package_items,
  public.be_patient_packages,
  public.be_patient_package_items,
  public.notification_delivery_attempts,
  public.system_settings,
  public.reminder_rules,
  integrator.user_reminder_occurrences,
  integrator.user_reminder_delivery_logs,
  p0_13_isolation.infra_rows,
  p0_13_isolation.telemetry_rows,
  p0_13_isolation.legacy_rows
TO ${appRoleIdent};

ALTER TABLE public.be_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_organization_members FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_be_organization_members ON public.be_organization_members
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
  );

ALTER TABLE public.be_subscription_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_subscription_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_be_subscription_packages ON public.be_subscription_packages
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
  );

ALTER TABLE public.be_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_package_items FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_be_package_items ON public.be_package_items
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.be_subscription_packages parent
      WHERE parent.id = be_package_items.package_id
        AND parent.organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );

ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_org_enrollments ON public.org_enrollments
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL
    AND platform_user_id = NULLIF(current_setting('app.patient_user_id', true), '')::uuid
  );

ALTER TABLE public.be_patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_patient_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_be_patient_packages ON public.be_patient_packages
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL
    AND platform_user_id = NULLIF(current_setting('app.patient_user_id', true), '')::uuid
  );

ALTER TABLE public.be_patient_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_patient_package_items FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_be_patient_package_items ON public.be_patient_package_items
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.be_patient_packages parent
      WHERE parent.id = be_patient_package_items.patient_package_id
        AND parent.organization_id = NULLIF(current_setting('app.org', true), '')::uuid
        AND parent.platform_user_id = NULLIF(current_setting('app.patient_user_id', true), '')::uuid
    )
  );

ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_notification_delivery_attempts ON public.notification_delivery_attempts
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL
    AND user_id = NULLIF(current_setting('app.patient_user_id', true), '')::uuid
  );

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_system_settings ON public.system_settings
  FOR SELECT USING (
    organization_id IS NULL
    OR (
      NULLIF(current_setting('app.org', true), '') IS NOT NULL
      AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );

ALTER TABLE integrator.user_reminder_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrator.user_reminder_delivery_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_user_reminder_delivery_logs ON integrator.user_reminder_delivery_logs
  FOR SELECT USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    AND NULLIF(current_setting('app.integrator_user_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM integrator.user_reminder_occurrences occurrence
      JOIN public.reminder_rules rule ON rule.integrator_rule_id = occurrence.rule_id
      WHERE occurrence.id = user_reminder_delivery_logs.occurrence_id
        AND rule.integrator_user_id = NULLIF(current_setting('app.integrator_user_id', true), '')::bigint
    )
  );

ALTER TABLE p0_13_isolation.infra_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_13_isolation.infra_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_infra_rows ON p0_13_isolation.infra_rows FOR SELECT USING (true);

ALTER TABLE p0_13_isolation.telemetry_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_13_isolation.telemetry_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_telemetry_rows ON p0_13_isolation.telemetry_rows FOR SELECT USING (true);

ALTER TABLE p0_13_isolation.legacy_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_13_isolation.legacy_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_13_2_legacy_rows ON p0_13_isolation.legacy_rows FOR SELECT USING (false);

SET ROLE ${appRoleIdent};
SET row_security = on;

SELECT (rolbypassrls = false)::int AS app_role_nobypass_ok FROM pg_roles WHERE rolname = '${appRole}' \gset
\if :app_role_nobypass_ok
\else
\echo 'FATAL: P0.13.2 app role must be NOBYPASSRLS.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

RESET app.org;
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT count(*)::int AS missing_org_member_count FROM public.be_organization_members \gset
\if :missing_org_member_count
\echo 'FATAL: missing app.org must fail closed for SCOPED org rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS missing_org_patient_count FROM public.org_enrollments \gset
\if :missing_org_patient_count
\echo 'FATAL: missing app.org must fail closed for patient rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS bootstrap_global_unset_count
FROM public.system_settings
WHERE key = 'p0_13_fixture_global' AND organization_id IS NULL \gset
\if :bootstrap_global_unset_count
\else
\echo 'FATAL: bootstrap global row must remain readable without app.org.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS bootstrap_org_unset_count
FROM public.system_settings
WHERE organization_id IS NOT NULL \gset
\if :bootstrap_org_unset_count
\echo 'FATAL: bootstrap org rows must not be readable without app.org.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS infra_count FROM p0_13_isolation.infra_rows \gset
SELECT count(*)::int AS telemetry_count FROM p0_13_isolation.telemetry_rows \gset
SELECT count(*)::int AS legacy_count FROM p0_13_isolation.legacy_rows \gset
\if :infra_count
\else
\echo 'FATAL: INFRA explicit treatment must remain readable.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\if :telemetry_count
\else
\echo 'FATAL: TELEMETRY explicit treatment must remain readable.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\if :legacy_count
\echo 'FATAL: LEGACY frozen treatment must deny rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT count(*)::int AS org_a_member_count FROM public.be_organization_members \gset
\if :org_a_member_count
\else
\echo 'FATAL: correct org must see own direct-org rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS org_a_wrong_member_count
FROM public.be_organization_members
WHERE organization_id = '${orgB}'::uuid \gset
\if :org_a_wrong_member_count
\echo 'FATAL: org A must not see org B direct-org rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS org_a_fk_count FROM public.be_package_items \gset
\if :org_a_fk_count
\else
\echo 'FATAL: correct org must see own FK-path rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgB}';
SELECT count(*)::int AS org_b_wrong_fk_count
FROM public.be_package_items item
JOIN public.be_subscription_packages package ON package.id = item.package_id
WHERE package.organization_id = '${orgA}'::uuid \gset
\if :org_b_wrong_fk_count
\echo 'FATAL: org B must not see org A FK-path rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '';
SELECT count(*)::int AS empty_org_member_count FROM public.be_organization_members \gset
\if :empty_org_member_count
\echo 'FATAL: empty app.org must fail closed for SCOPED org rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
RESET app.patient_user_id;
SELECT count(*)::int AS missing_patient_count FROM public.org_enrollments \gset
\if :missing_patient_count
\echo 'FATAL: missing app.patient_user_id must fail closed where patient predicate applies.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.patient_user_id = '${patientA1}';
SELECT count(*)::int AS patient_a1_enrollment_count FROM public.org_enrollments \gset
\if :patient_a1_enrollment_count
\else
\echo 'FATAL: patient A1 must see own enrollment row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS patient_a1_cross_patient_count
FROM public.org_enrollments
WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :patient_a1_cross_patient_count
\echo 'FATAL: patient A1 must not see patient A2 same-org rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS patient_a1_denorm_count
FROM public.notification_delivery_attempts \gset
\if :patient_a1_denorm_count
\else
\echo 'FATAL: patient A1 must see own denorm-path row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS patient_a1_package_item_count
FROM public.be_patient_package_items \gset
\if :patient_a1_package_item_count
\else
\echo 'FATAL: patient A1 must see own patient FK-path row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.patient_user_id = '${patientA2}';
SELECT count(*)::int AS patient_a2_cross_patient_count
FROM public.notification_delivery_attempts
WHERE user_id = '${patientA1}'::uuid \gset
\if :patient_a2_cross_patient_count
\echo 'FATAL: patient A2 must not see patient A1 denorm rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgB}';
SET app.patient_user_id = '${patientB1}';
SELECT count(*)::int AS patient_b1_enrollment_count FROM public.org_enrollments \gset
\if :patient_b1_enrollment_count
\else
\echo 'FATAL: patient B1 must see own cross-org fixture row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SET app.integrator_user_id = '${syntheticIntegratorUserIds.patientA1}';
SELECT count(*)::int AS integrator_a1_log_count FROM integrator.user_reminder_delivery_logs \gset
\if :integrator_a1_log_count
\else
\echo 'FATAL: integrator patient A1 must see own denorm log row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.integrator_user_id = '${syntheticIntegratorUserIds.patientB1}';
SELECT count(*)::int AS integrator_wrong_patient_count FROM integrator.user_reminder_delivery_logs \gset
\if :integrator_wrong_patient_count
\echo 'FATAL: integrator wrong patient must see zero rows inside org A.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

\echo 'P0.13.2 DB isolation scratch smoke OK: NOBYPASSRLS, org wall, patient wall, bootstrap, INFRA/TELEMETRY/LEGACY.'
`;

try {
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);
  psql(renderP013SyntheticFixtureCompatSchemaSql());
  psql(renderP013SyntheticFixtureScratchSql());
  psql(isolationSql);
  console.log(`smoke-p0-13-db-isolation: OK (${dbName})`);
} finally {
  run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], {
    input: `DROP ROLE IF EXISTS ${appRoleIdent};\n`,
  });
}
