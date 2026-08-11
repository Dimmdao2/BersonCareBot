#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getP085IntegratorDirectUserBridgeDescriptors,
  getP085IntegratorIdentityBridgeDescriptors,
  getP085IntegratorParentDenormDescriptors,
  getP085IntegratorScopedDescriptors,
  renderP085PolicyStatements,
} from './p0-8-5-policy-targets.mjs';
import { quoteQualifiedName } from './rls-sql-renderer.mjs';

const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const scratchUrl = process.env.SCRATCH_DATABASE_URL;

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function assertSafeScratchUrl(value) {
  if (!value) {
    fail('SCRATCH_DATABASE_URL is required for P0.8.5 scratch smoke.');
  }

  if (value.includes('/opt/env/') || value.includes('api.prod') || value.includes('webapp.prod')) {
    fail('SCRATCH_DATABASE_URL must not reference host env files or production env names.');
  }

  if (value.includes('bcb_webapp_dev') || value.includes('bcb_webapp_prod')) {
    fail('SCRATCH_DATABASE_URL must not target dev/prod PII databases.');
  }

  const dbName = databaseNameFromUrl(value);

  if (!dbName || (!dbName.startsWith('bcb_saas_') && !dbName.includes('scratch'))) {
    fail('Scratch database name must start with bcb_saas_ or contain scratch.');
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderTargetTableSetup(descriptors) {
  if (
    descriptors.map(({ table }) => table).join(',') !==
    'integrator.user_reminder_delivery_logs,integrator.user_reminder_occurrences'
  ) {
    throw new Error('P0.8.5 scratch setup only supports the post-drop reminder targets');
  }

  return String.raw`
DROP TABLE IF EXISTS integrator.user_reminder_delivery_logs CASCADE;
DROP TABLE IF EXISTS integrator.user_reminder_occurrences CASCADE;
DROP TABLE IF EXISTS public.reminder_rules CASCADE;
CREATE TABLE public.reminder_rules (
  integrator_rule_id text PRIMARY KEY,
  integrator_user_id bigint NOT NULL
);
CREATE TABLE integrator.user_reminder_occurrences (
  id uuid PRIMARY KEY,
  rule_id text NOT NULL REFERENCES public.reminder_rules(integrator_rule_id),
  organization_id uuid NOT NULL,
  payload text NOT NULL
);
CREATE TABLE integrator.user_reminder_delivery_logs (
  id uuid PRIMARY KEY,
  occurrence_id uuid NOT NULL REFERENCES integrator.user_reminder_occurrences(id),
  organization_id uuid NOT NULL,
  payload text NOT NULL
);
INSERT INTO public.reminder_rules VALUES ('rule-a', 1001), ('rule-b', 1002);
INSERT INTO integrator.user_reminder_occurrences VALUES
  (md5('occurrence-a')::uuid, 'rule-a', '${orgA}', 'occurrence-a'),
  (md5('occurrence-b')::uuid, 'rule-b', '${orgB}', 'occurrence-b');
INSERT INTO integrator.user_reminder_delivery_logs VALUES
  (md5('delivery-a')::uuid, md5('occurrence-a')::uuid, '${orgA}', 'delivery-a'),
  (md5('delivery-b')::uuid, md5('occurrence-b')::uuid, '${orgB}', 'delivery-b');
ALTER TABLE public.reminder_rules OWNER TO :"p0_8_5_owner_role";
ALTER TABLE integrator.user_reminder_occurrences OWNER TO :"p0_8_5_owner_role";
ALTER TABLE integrator.user_reminder_delivery_logs OWNER TO :"p0_8_5_owner_role";
GRANT SELECT ON TABLE public.reminder_rules TO :"p0_8_5_app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  integrator.user_reminder_occurrences,
  integrator.user_reminder_delivery_logs
TO :"p0_8_5_app_role";`;
}

function renderVisibleRowsCte(descriptors) {
  const unions = descriptors
    .map((descriptor) => {
      const sourceStageLiteral = sqlLiteral(descriptor.sourceStage);
      const scopingKindLiteral = sqlLiteral(descriptor.scopingKind);

      return [
        'SELECT',
        `  ${sourceStageLiteral} AS source_stage,`,
        `  ${scopingKindLiteral} AS scoping_kind,`,
        '  organization_id,',
        '  payload',
        `FROM ${quoteQualifiedName(descriptor.table)}`,
      ].join('\n');
    })
    .join('\nUNION ALL\n');

  return `WITH visible_integrator_rows AS (\n${unions}\n)`;
}

function renderSmokeSql() {
  const i1Descriptors = getP085IntegratorDirectUserBridgeDescriptors();
  const i2Descriptors = getP085IntegratorIdentityBridgeDescriptors();
  const i3Descriptors = getP085IntegratorParentDenormDescriptors();
  const descriptors = getP085IntegratorScopedDescriptors();
  const totalRows = descriptors.length * 2;
  const perOrgRows = descriptors.length;
  const denormPerOrgRows = i3Descriptors.length;
  const policyStatements = renderP085PolicyStatements({ descriptors }).join('\n');
  const visibleRowsCte = renderVisibleRowsCte(descriptors);

  return String.raw`\set ON_ERROR_STOP on
\pset pager off

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_8_5_scratch_db_ok \gset

\if :p0_8_5_scratch_db_ok
\else
\echo 'FATAL: P0.8.5 scratch smoke must run only on a scratch/SaaS proof database.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT (current_database() NOT IN ('bcb_webapp_dev', 'bcb_webapp_prod', 'bersoncarebot'))::int AS p0_8_5_not_dev_prod_ok \gset

\if :p0_8_5_not_dev_prod_ok
\else
\echo 'FATAL: P0.8.5 scratch smoke refuses dev/prod/runtime databases.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT (rolsuper OR rolcreaterole)::int AS p0_8_5_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_8_5_can_manage_roles
\else
\echo 'FATAL: P0.8.5 scratch smoke requires a scratch role with CREATEROLE or superuser privileges.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT
  'p0_8_5_owner_' || pg_backend_pid() AS p0_8_5_owner_role,
  'p0_8_5_app_' || pg_backend_pid() AS p0_8_5_app_role \gset

BEGIN;

CREATE ROLE :"p0_8_5_owner_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_8_5_app_role" NOLOGIN NOBYPASSRLS;
GRANT :"p0_8_5_owner_role" TO CURRENT_USER;
GRANT :"p0_8_5_app_role" TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS integrator;
GRANT USAGE, CREATE ON SCHEMA integrator TO :"p0_8_5_owner_role";
GRANT USAGE ON SCHEMA integrator TO :"p0_8_5_app_role";

${renderTargetTableSetup(descriptors)}

${policyStatements}

SELECT (NOT rolbypassrls)::int AS p0_8_5_app_nobypass_ok
FROM pg_roles
WHERE rolname = :'p0_8_5_app_role' \gset

\if :p0_8_5_app_nobypass_ok
\else
\echo 'FATAL: P0.8.5 app role must be NOBYPASSRLS.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SET LOCAL ROLE :"p0_8_5_owner_role";
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_5_owner_visible_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_owner_visible_ok
\else
\echo 'FATAL: owner role should see all synthetic integrator rows in dormant mode.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

RESET ROLE;
SET LOCAL ROLE :"p0_8_5_app_role";
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_5_app_unset_visible_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_app_unset_visible_ok
\else
\echo 'FATAL: app role with unset app.org should see all integrator rows in dormant permissive mode.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT set_config('app.org', '${orgA}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = 0
)::int AS p0_8_5_app_org_a_visible_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_app_org_a_visible_ok
\else
\echo 'FATAL: app role with org A should see only org A integrator rows.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

${visibleRowsCte}
SELECT (
  count(*) FILTER (WHERE source_stage = 'P0.4.I1') = ${i1Descriptors.length}
  AND count(*) FILTER (WHERE source_stage = 'P0.4.I2') = ${i2Descriptors.length}
  AND count(*) FILTER (WHERE source_stage = 'P0.4.I3') = ${denormPerOrgRows}
  AND count(*) FILTER (WHERE source_stage = 'P0.4.I3' AND scoping_kind = 'denorm_org_column') = ${denormPerOrgRows}
)::int AS p0_8_5_app_org_a_source_split_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_app_org_a_source_split_ok
\else
\echo 'FATAL: org A visibility should preserve the post-drop P0.4.I3 reminder descriptors.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT set_config('app.org', '${orgB}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = 0
)::int AS p0_8_5_app_org_b_visible_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_app_org_b_visible_ok
\else
\echo 'FATAL: app role with org B should see only org B integrator rows.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

SELECT set_config('app.org', '', true);
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_5_app_empty_visible_ok
FROM visible_integrator_rows \gset

\if :p0_8_5_app_empty_visible_ok
\else
\echo 'FATAL: app role with empty app.org should match dormant permissive unset behavior.'
SELECT 1 / 0 AS p0_8_5_abort;
\endif

RESET ROLE;
ROLLBACK;

\echo 'P0.8.5 integrator scoped scratch smoke OK: 2 post-drop I3 targets, NOBYPASSRLS, dormant unset/empty permit, org A/B isolation.'
`;
}

assertSafeScratchUrl(scratchUrl);

if (process.argv.includes('--print-sql')) {
  process.stdout.write(renderSmokeSql());
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), 'p0-8-5-smoke-'));
const sqlFile = join(tempDir, 'smoke.sql');

try {
  writeFileSync(sqlFile, renderSmokeSql(), { encoding: 'utf8', mode: 0o600 });

  const result = spawnSync('psql', ['-f', sqlFile, scratchUrl], {
    stdio: ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8',
  });

  if (result.error) {
    fail(`Failed to start psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
