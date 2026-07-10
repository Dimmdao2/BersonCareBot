#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getP086BootstrapHybridDescriptors,
  renderP086PolicyStatements,
} from "./p0-8-6-policy-targets.mjs";
import { quoteQualifiedName } from "./rls-sql-renderer.mjs";

const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const scratchUrl = process.env.SCRATCH_DATABASE_URL;

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function assertSafeScratchUrl(value) {
  if (!value) {
    fail("SCRATCH_DATABASE_URL is required for P0.8.6 scratch smoke.");
  }

  if (value.includes("/opt/env/") || value.includes("api.prod") || value.includes("webapp.prod")) {
    fail("SCRATCH_DATABASE_URL must not reference host env files or production env names.");
  }

  if (value.includes("bcb_webapp_dev") || value.includes("bcb_webapp_prod")) {
    fail("SCRATCH_DATABASE_URL must not target dev/prod PII databases.");
  }

  const dbName = databaseNameFromUrl(value);

  if (!dbName || (!dbName.startsWith("bcb_saas_") && !dbName.includes("scratch"))) {
    fail("Scratch database name must start with bcb_saas_ or contain scratch.");
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderTargetTableSetup(descriptors) {
  return descriptors
    .map((descriptor, index) => {
      const target = quoteQualifiedName(descriptor.table);
      const globalPayload = sqlLiteral(`p0-8-6-global-${index}`);
      const payloadA = sqlLiteral(`p0-8-6-org-a-${index}`);
      const payloadB = sqlLiteral(`p0-8-6-org-b-${index}`);

      return [
        `DROP TABLE IF EXISTS ${target} CASCADE;`,
        `CREATE TABLE ${target} (`,
        "  id uuid PRIMARY KEY,",
        "  organization_id uuid,",
        "  payload text NOT NULL",
        ");",
        `INSERT INTO ${target} (id, organization_id, payload) VALUES`,
        `  (md5(${sqlLiteral(`${descriptor.table}|global`)})::uuid, NULL, ${globalPayload}),`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-a`)})::uuid, '${orgA}', ${payloadA}),`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-b`)})::uuid, '${orgB}', ${payloadB});`,
        `ALTER TABLE ${target} OWNER TO :"p0_8_6_owner_role";`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${target} TO :"p0_8_6_app_role";`,
      ].join("\n");
    })
    .join("\n");
}

function renderVisibleRowsCte(descriptors) {
  const unions = descriptors
    .map((descriptor) => {
      const tableLiteral = sqlLiteral(descriptor.table);

      return [
        "SELECT",
        `  ${tableLiteral} AS target_table,`,
        "  organization_id,",
        "  payload",
        `FROM ${quoteQualifiedName(descriptor.table)}`,
      ].join("\n");
    })
    .join("\nUNION ALL\n");

  return `WITH visible_bootstrap_rows AS (\n${unions}\n)`;
}

function renderSmokeSql() {
  const descriptors = getP086BootstrapHybridDescriptors();
  const targetCount = descriptors.length;
  const globalRows = targetCount;
  const orgAPlusGlobalRows = targetCount * 2;
  const policyStatements = renderP086PolicyStatements({ descriptors }).join("\n");
  const visibleRowsCte = renderVisibleRowsCte(descriptors);

  return String.raw`\set ON_ERROR_STOP on
\pset pager off

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_8_6_scratch_db_ok \gset

\if :p0_8_6_scratch_db_ok
\else
\echo 'FATAL: P0.8.6 scratch smoke must run only on a scratch/SaaS proof database.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT (current_database() NOT IN ('bcb_webapp_dev', 'bcb_webapp_prod', 'bersoncarebot'))::int AS p0_8_6_not_dev_prod_ok \gset

\if :p0_8_6_not_dev_prod_ok
\else
\echo 'FATAL: P0.8.6 scratch smoke refuses dev/prod/runtime databases.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT (rolsuper OR rolcreaterole)::int AS p0_8_6_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_8_6_can_manage_roles
\else
\echo 'FATAL: P0.8.6 scratch smoke requires a scratch role with CREATEROLE or superuser privileges.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT
  'p0_8_6_owner_' || pg_backend_pid() AS p0_8_6_owner_role,
  'p0_8_6_app_' || pg_backend_pid() AS p0_8_6_app_role \gset

BEGIN;

CREATE ROLE :"p0_8_6_owner_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_8_6_app_role" NOLOGIN NOBYPASSRLS;
GRANT :"p0_8_6_owner_role" TO CURRENT_USER;
GRANT :"p0_8_6_app_role" TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS integrator;
GRANT USAGE, CREATE ON SCHEMA public TO :"p0_8_6_owner_role";
GRANT USAGE, CREATE ON SCHEMA integrator TO :"p0_8_6_owner_role";
GRANT USAGE ON SCHEMA public TO :"p0_8_6_app_role";
GRANT USAGE ON SCHEMA integrator TO :"p0_8_6_app_role";

${renderTargetTableSetup(descriptors)}

${policyStatements}

SELECT (NOT rolbypassrls)::int AS p0_8_6_app_nobypass_ok
FROM pg_roles
WHERE rolname = :'p0_8_6_app_role' \gset

\if :p0_8_6_app_nobypass_ok
\else
\echo 'FATAL: P0.8.6 app role must be NOBYPASSRLS.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

RESET ROLE;
SET LOCAL ROLE :"p0_8_6_app_role";
${visibleRowsCte}
SELECT (
  count(*) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id IS NULL) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id IS NOT NULL) = 0
)::int AS p0_8_6_app_unset_global_only_ok
FROM visible_bootstrap_rows \gset

\if :p0_8_6_app_unset_global_only_ok
\else
\echo 'FATAL: app role with unset app.org should see only global NULL bootstrap rows.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT set_config('app.org', '${orgA}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${orgAPlusGlobalRows}
  AND count(*) FILTER (WHERE organization_id IS NULL) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = ${globalRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = 0
)::int AS p0_8_6_app_org_a_visible_ok
FROM visible_bootstrap_rows \gset

\if :p0_8_6_app_org_a_visible_ok
\else
\echo 'FATAL: app role with org A should see global NULL rows plus only org A bootstrap rows.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT set_config('app.org', '${orgB}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${orgAPlusGlobalRows}
  AND count(*) FILTER (WHERE organization_id IS NULL) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = ${globalRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = 0
)::int AS p0_8_6_app_org_b_visible_ok
FROM visible_bootstrap_rows \gset

\if :p0_8_6_app_org_b_visible_ok
\else
\echo 'FATAL: app role with org B should see global NULL rows plus only org B bootstrap rows.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

SELECT set_config('app.org', '', true);
${visibleRowsCte}
SELECT (
  count(*) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id IS NULL) = ${globalRows}
  AND count(*) FILTER (WHERE organization_id IS NOT NULL) = 0
)::int AS p0_8_6_app_empty_global_only_ok
FROM visible_bootstrap_rows \gset

\if :p0_8_6_app_empty_global_only_ok
\else
\echo 'FATAL: app role with empty app.org should behave like unset: global NULL rows only.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

RESET ROLE;
SET LOCAL ROLE :"p0_8_6_owner_role";
${visibleRowsCte}
SELECT (count(*) = ${globalRows})::int AS p0_8_6_force_owner_global_only_ok
FROM visible_bootstrap_rows \gset

\if :p0_8_6_force_owner_global_only_ok
\else
\echo 'FATAL: FORCE RLS owner role with unset app.org should also see only global rows.'
SELECT 1 / 0 AS p0_8_6_abort;
\endif

RESET ROLE;
ROLLBACK;

\echo 'P0.8.6 bootstrap hybrid scratch smoke OK: 4 targets, NOBYPASSRLS, unset/empty global-only, org context global+matching-org only.'
`;
}

assertSafeScratchUrl(scratchUrl);

if (process.argv.includes("--print-sql")) {
  process.stdout.write(renderSmokeSql());
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "p0-8-6-smoke-"));
const sqlFile = join(tempDir, "smoke.sql");

try {
  writeFileSync(sqlFile, renderSmokeSql(), { encoding: "utf8", mode: 0o600 });

  const result = spawnSync("psql", ["-f", sqlFile, scratchUrl], {
    stdio: ["ignore", "inherit", "inherit"],
    encoding: "utf8",
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
