#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getP083PublicDirectOrgDescriptors,
  renderP083PolicyStatements,
} from "./p0-8-3-policy-targets.mjs";
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
    fail("SCRATCH_DATABASE_URL is required for P0.8.3 scratch smoke.");
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

function renderSyntheticTableSetup(descriptors) {
  return descriptors
    .map((descriptor, index) => {
      const target = quoteQualifiedName(descriptor.table);
      const payloadA = sqlLiteral(`target-${index}-org-a`);
      const payloadB = sqlLiteral(`target-${index}-org-b`);

      return [
        `DROP TABLE IF EXISTS ${target} CASCADE;`,
        `CREATE TABLE ${target} (`,
        "  id uuid PRIMARY KEY,",
        "  organization_id uuid NOT NULL,",
        "  payload text NOT NULL",
        ");",
        `INSERT INTO ${target} (id, organization_id, payload) VALUES`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-a`)})::uuid, '${orgA}', ${payloadA}),`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-b`)})::uuid, '${orgB}', ${payloadB});`,
        `ALTER TABLE ${target} OWNER TO :"p0_8_3_owner_role";`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${target} TO :"p0_8_3_app_role";`,
      ].join("\n");
    })
    .join("\n");
}

function renderVisibleRowsCte(descriptors) {
  const unions = descriptors
    .map((descriptor) => `SELECT organization_id, payload FROM ${quoteQualifiedName(descriptor.table)}`)
    .join("\nUNION ALL\n");

  return `WITH visible_rows AS (\n${unions}\n)`;
}

function renderSmokeSql() {
  const descriptors = getP083PublicDirectOrgDescriptors();
  const totalRows = descriptors.length * 2;
  const perOrgRows = descriptors.length;
  const policyStatements = renderP083PolicyStatements({ descriptors }).join("\n");
  const visibleRowsCte = renderVisibleRowsCte(descriptors);

  return String.raw`\set ON_ERROR_STOP on
\pset pager off

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_8_3_scratch_db_ok \gset

\if :p0_8_3_scratch_db_ok
\else
\echo 'FATAL: P0.8.3 scratch smoke must run only on a scratch/SaaS proof database.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT (current_database() NOT IN ('bcb_webapp_dev', 'bcb_webapp_prod', 'bersoncarebot'))::int AS p0_8_3_not_dev_prod_ok \gset

\if :p0_8_3_not_dev_prod_ok
\else
\echo 'FATAL: P0.8.3 scratch smoke refuses dev/prod/runtime databases.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT (rolsuper OR rolcreaterole)::int AS p0_8_3_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_8_3_can_manage_roles
\else
\echo 'FATAL: P0.8.3 scratch smoke requires a scratch role with CREATEROLE or superuser privileges.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT
  'p0_8_3_owner_' || pg_backend_pid() AS p0_8_3_owner_role,
  'p0_8_3_app_' || pg_backend_pid() AS p0_8_3_app_role \gset

BEGIN;

CREATE ROLE :"p0_8_3_owner_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_8_3_app_role" NOLOGIN NOBYPASSRLS;
GRANT :"p0_8_3_owner_role" TO CURRENT_USER;
GRANT :"p0_8_3_app_role" TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA public TO :"p0_8_3_owner_role";
GRANT USAGE ON SCHEMA public TO :"p0_8_3_app_role";

${renderSyntheticTableSetup(descriptors)}

${policyStatements}

SELECT (NOT rolbypassrls)::int AS p0_8_3_app_nobypass_ok
FROM pg_roles
WHERE rolname = :'p0_8_3_app_role' \gset

\if :p0_8_3_app_nobypass_ok
\else
\echo 'FATAL: P0.8.3 app role must be NOBYPASSRLS.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SET LOCAL ROLE :"p0_8_3_owner_role";
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_3_owner_visible_ok
FROM visible_rows \gset

\if :p0_8_3_owner_visible_ok
\else
\echo 'FATAL: owner role should see both synthetic org rows in dormant mode.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

RESET ROLE;
SET LOCAL ROLE :"p0_8_3_app_role";
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_3_app_unset_visible_ok
FROM visible_rows \gset

\if :p0_8_3_app_unset_visible_ok
\else
\echo 'FATAL: app role with unset app.org should see all rows in dormant permissive mode.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT set_config('app.org', '${orgA}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = 0
)::int AS p0_8_3_app_org_a_visible_ok
FROM visible_rows \gset

\if :p0_8_3_app_org_a_visible_ok
\else
\echo 'FATAL: app role with org A should see only org A rows.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT set_config('app.org', '${orgB}', true);
${visibleRowsCte}
SELECT (
  count(*) = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = ${perOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = 0
)::int AS p0_8_3_app_org_b_visible_ok
FROM visible_rows \gset

\if :p0_8_3_app_org_b_visible_ok
\else
\echo 'FATAL: app role with org B should see only org B rows.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

SELECT set_config('app.org', '', true);
${visibleRowsCte}
SELECT (count(*) = ${totalRows})::int AS p0_8_3_app_empty_visible_ok
FROM visible_rows \gset

\if :p0_8_3_app_empty_visible_ok
\else
\echo 'FATAL: app role with empty app.org should match dormant permissive unset behavior.'
SELECT 1 / 0 AS p0_8_3_abort;
\endif

RESET ROLE;
ROLLBACK;

\echo 'P0.8.3 direct-org scratch smoke OK: 103 targets, dormant unset/empty permit, org A/B isolation.'
`;
}

assertSafeScratchUrl(scratchUrl);

if (process.argv.includes("--print-sql")) {
  process.stdout.write(renderSmokeSql());
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "p0-8-3-smoke-"));
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
