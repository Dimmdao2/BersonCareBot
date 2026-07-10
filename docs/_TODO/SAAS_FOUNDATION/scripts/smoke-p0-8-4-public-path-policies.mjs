#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getP084PublicDenormDescriptors,
  getP084PublicFkPathDescriptors,
  renderP084PolicyStatements,
} from "./p0-8-4-policy-targets.mjs";
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
    fail("SCRATCH_DATABASE_URL is required for P0.8.4 scratch smoke.");
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

function renderDenormTableSetup(descriptors) {
  return descriptors
    .map((descriptor, index) => {
      const target = quoteQualifiedName(descriptor.table);
      const payloadA = sqlLiteral(`denorm-${index}-org-a`);
      const payloadB = sqlLiteral(`denorm-${index}-org-b`);

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
        `ALTER TABLE ${target} OWNER TO :"p0_8_4_owner_role";`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${target} TO :"p0_8_4_app_role";`,
      ].join("\n");
    })
    .join("\n");
}

function renderFkPathSetup(descriptors) {
  const parentTables = Array.from(
    new Set(descriptors.flatMap((descriptor) => [descriptor.fkPath.parentTable, descriptor.fkPath.crossCheckTable])),
  ).sort();

  const parentSetup = parentTables
    .map((table) => {
      const target = quoteQualifiedName(table);

      return [
        `DROP TABLE IF EXISTS ${target} CASCADE;`,
        `CREATE TABLE ${target} (`,
        "  id uuid PRIMARY KEY,",
        "  organization_id uuid NOT NULL",
        ");",
        `INSERT INTO ${target} (id, organization_id) VALUES`,
        `  (md5(${sqlLiteral(`${table}|org-a`)})::uuid, '${orgA}'),`,
        `  (md5(${sqlLiteral(`${table}|org-b`)})::uuid, '${orgB}');`,
        `ALTER TABLE ${target} OWNER TO :"p0_8_4_owner_role";`,
        `GRANT SELECT ON TABLE ${target} TO :"p0_8_4_app_role";`,
      ].join("\n");
    })
    .join("\n");

  const childSetup = descriptors
    .map((descriptor, index) => {
      const target = quoteQualifiedName(descriptor.table);
      const fkPath = descriptor.fkPath;
      const localFk = fkPath.localFk;
      const crossLocalFk = fkPath.crossCheckLocalFk;

      return [
        `DROP TABLE IF EXISTS ${target} CASCADE;`,
        `CREATE TABLE ${target} (`,
        "  id uuid PRIMARY KEY,",
        `  ${localFk} uuid NOT NULL,`,
        `  ${crossLocalFk} uuid NOT NULL,`,
        "  payload text NOT NULL",
        ");",
        `INSERT INTO ${target} (id, ${localFk}, ${crossLocalFk}, payload) VALUES`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-a`)})::uuid, md5(${sqlLiteral(
          `${fkPath.parentTable}|org-a`,
        )})::uuid, md5(${sqlLiteral(`${fkPath.crossCheckTable}|org-a`)})::uuid, ${sqlLiteral(
          `fk-${index}-org-a`,
        )}),`,
        `  (md5(${sqlLiteral(`${descriptor.table}|org-b`)})::uuid, md5(${sqlLiteral(
          `${fkPath.parentTable}|org-b`,
        )})::uuid, md5(${sqlLiteral(`${fkPath.crossCheckTable}|org-b`)})::uuid, ${sqlLiteral(
          `fk-${index}-org-b`,
        )}),`,
        `  (md5(${sqlLiteral(`${descriptor.table}|mismatch`)})::uuid, md5(${sqlLiteral(
          `${fkPath.parentTable}|org-a`,
        )})::uuid, md5(${sqlLiteral(`${fkPath.crossCheckTable}|org-b`)})::uuid, ${sqlLiteral(
          `fk-${index}-mismatch`,
        )});`,
        `ALTER TABLE ${target} OWNER TO :"p0_8_4_owner_role";`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${target} TO :"p0_8_4_app_role";`,
      ].join("\n");
    })
    .join("\n");

  return `${parentSetup}\n${childSetup}`;
}

function renderDenormVisibleRowsCte(descriptors) {
  const unions = descriptors
    .map((descriptor) => `SELECT organization_id, payload FROM ${quoteQualifiedName(descriptor.table)}`)
    .join("\nUNION ALL\n");

  return `WITH visible_denorm_rows AS (\n${unions}\n)`;
}

function renderFkVisibleRowsCte(descriptors) {
  const unions = descriptors
    .map((descriptor) => {
      const target = quoteQualifiedName(descriptor.table);
      const parent = quoteQualifiedName(descriptor.fkPath.parentTable);
      const cross = quoteQualifiedName(descriptor.fkPath.crossCheckTable);

      return [
        "SELECT",
        "  parent.organization_id AS parent_organization_id,",
        "  cross_ref.organization_id AS cross_organization_id,",
        "  target.payload",
        `FROM ${target} AS target`,
        `JOIN ${parent} AS parent ON parent.${descriptor.fkPath.parentPk} = target.${descriptor.fkPath.localFk}`,
        `JOIN ${cross} AS cross_ref ON cross_ref.${descriptor.fkPath.crossCheckPk} = target.${descriptor.fkPath.crossCheckLocalFk}`,
      ].join("\n");
    })
    .join("\nUNION ALL\n");

  return `WITH visible_fk_rows AS (\n${unions}\n)`;
}

function renderSmokeSql() {
  const denormDescriptors = getP084PublicDenormDescriptors();
  const fkPathDescriptors = getP084PublicFkPathDescriptors();
  const descriptors = [...fkPathDescriptors, ...denormDescriptors].sort((left, right) =>
    left.table.localeCompare(right.table),
  );
  const denormTotalRows = denormDescriptors.length * 2;
  const denormPerOrgRows = denormDescriptors.length;
  const fkTotalRows = fkPathDescriptors.length * 3;
  const fkPerOrgRows = fkPathDescriptors.length;
  const policyStatements = renderP084PolicyStatements({ descriptors }).join("\n");
  const denormVisibleRowsCte = renderDenormVisibleRowsCte(denormDescriptors);
  const fkVisibleRowsCte = renderFkVisibleRowsCte(fkPathDescriptors);

  return String.raw`\set ON_ERROR_STOP on
\pset pager off

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_8_4_scratch_db_ok \gset

\if :p0_8_4_scratch_db_ok
\else
\echo 'FATAL: P0.8.4 scratch smoke must run only on a scratch/SaaS proof database.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT (current_database() NOT IN ('bcb_webapp_dev', 'bcb_webapp_prod', 'bersoncarebot'))::int AS p0_8_4_not_dev_prod_ok \gset

\if :p0_8_4_not_dev_prod_ok
\else
\echo 'FATAL: P0.8.4 scratch smoke refuses dev/prod/runtime databases.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT (rolsuper OR rolcreaterole)::int AS p0_8_4_can_manage_roles
FROM pg_roles
WHERE rolname = current_user \gset

\if :p0_8_4_can_manage_roles
\else
\echo 'FATAL: P0.8.4 scratch smoke requires a scratch role with CREATEROLE or superuser privileges.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT
  'p0_8_4_owner_' || pg_backend_pid() AS p0_8_4_owner_role,
  'p0_8_4_app_' || pg_backend_pid() AS p0_8_4_app_role \gset

BEGIN;

CREATE ROLE :"p0_8_4_owner_role" NOLOGIN NOBYPASSRLS;
CREATE ROLE :"p0_8_4_app_role" NOLOGIN NOBYPASSRLS;
GRANT :"p0_8_4_owner_role" TO CURRENT_USER;
GRANT :"p0_8_4_app_role" TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA public TO :"p0_8_4_owner_role";
GRANT USAGE ON SCHEMA public TO :"p0_8_4_app_role";

${renderFkPathSetup(fkPathDescriptors)}

${renderDenormTableSetup(denormDescriptors)}

${policyStatements}

SELECT (NOT rolbypassrls)::int AS p0_8_4_app_nobypass_ok
FROM pg_roles
WHERE rolname = :'p0_8_4_app_role' \gset

\if :p0_8_4_app_nobypass_ok
\else
\echo 'FATAL: P0.8.4 app role must be NOBYPASSRLS.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SET LOCAL ROLE :"p0_8_4_owner_role";
${denormVisibleRowsCte}
SELECT (count(*) = ${denormTotalRows})::int AS p0_8_4_denorm_owner_visible_ok
FROM visible_denorm_rows \gset

\if :p0_8_4_denorm_owner_visible_ok
\else
\echo 'FATAL: owner role should see both synthetic denorm org rows in dormant mode.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

${fkVisibleRowsCte}
SELECT (count(*) = ${fkTotalRows})::int AS p0_8_4_fk_owner_visible_ok
FROM visible_fk_rows \gset

\if :p0_8_4_fk_owner_visible_ok
\else
\echo 'FATAL: owner role should see both FK org rows plus mismatch rows in dormant mode.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

RESET ROLE;
SET LOCAL ROLE :"p0_8_4_app_role";
${denormVisibleRowsCte}
SELECT (count(*) = ${denormTotalRows})::int AS p0_8_4_denorm_app_unset_visible_ok
FROM visible_denorm_rows \gset

\if :p0_8_4_denorm_app_unset_visible_ok
\else
\echo 'FATAL: app role with unset app.org should see all denorm rows in dormant permissive mode.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

${fkVisibleRowsCte}
SELECT (count(*) = ${fkTotalRows})::int AS p0_8_4_fk_app_unset_visible_ok
FROM visible_fk_rows \gset

\if :p0_8_4_fk_app_unset_visible_ok
\else
\echo 'FATAL: app role with unset app.org should see all FK rows in dormant permissive mode.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT set_config('app.org', '${orgA}', true);
${denormVisibleRowsCte}
SELECT (
  count(*) = ${denormPerOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = ${denormPerOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = 0
)::int AS p0_8_4_denorm_app_org_a_visible_ok
FROM visible_denorm_rows \gset

\if :p0_8_4_denorm_app_org_a_visible_ok
\else
\echo 'FATAL: app role with org A should see only org A denorm rows.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

${fkVisibleRowsCte}
SELECT (
  count(*) = ${fkPerOrgRows}
  AND count(*) FILTER (WHERE parent_organization_id = '${orgA}' AND cross_organization_id = '${orgA}') = ${fkPerOrgRows}
  AND count(*) FILTER (WHERE parent_organization_id <> cross_organization_id) = 0
)::int AS p0_8_4_fk_app_org_a_visible_ok
FROM visible_fk_rows \gset

\if :p0_8_4_fk_app_org_a_visible_ok
\else
\echo 'FATAL: app role with org A should see only org A FK rows and no cross-org mismatch rows.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT set_config('app.org', '${orgB}', true);
${denormVisibleRowsCte}
SELECT (
  count(*) = ${denormPerOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgB}') = ${denormPerOrgRows}
  AND count(*) FILTER (WHERE organization_id = '${orgA}') = 0
)::int AS p0_8_4_denorm_app_org_b_visible_ok
FROM visible_denorm_rows \gset

\if :p0_8_4_denorm_app_org_b_visible_ok
\else
\echo 'FATAL: app role with org B should see only org B denorm rows.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

${fkVisibleRowsCte}
SELECT (
  count(*) = ${fkPerOrgRows}
  AND count(*) FILTER (WHERE parent_organization_id = '${orgB}' AND cross_organization_id = '${orgB}') = ${fkPerOrgRows}
  AND count(*) FILTER (WHERE parent_organization_id <> cross_organization_id) = 0
)::int AS p0_8_4_fk_app_org_b_visible_ok
FROM visible_fk_rows \gset

\if :p0_8_4_fk_app_org_b_visible_ok
\else
\echo 'FATAL: app role with org B should see only org B FK rows and no cross-org mismatch rows.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

SELECT set_config('app.org', '', true);
${denormVisibleRowsCte}
SELECT (count(*) = ${denormTotalRows})::int AS p0_8_4_denorm_app_empty_visible_ok
FROM visible_denorm_rows \gset

\if :p0_8_4_denorm_app_empty_visible_ok
\else
\echo 'FATAL: app role with empty app.org should match dormant permissive denorm unset behavior.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

${fkVisibleRowsCte}
SELECT (count(*) = ${fkTotalRows})::int AS p0_8_4_fk_app_empty_visible_ok
FROM visible_fk_rows \gset

\if :p0_8_4_fk_app_empty_visible_ok
\else
\echo 'FATAL: app role with empty app.org should match dormant permissive FK unset behavior.'
SELECT 1 / 0 AS p0_8_4_abort;
\endif

RESET ROLE;
ROLLBACK;

\echo 'P0.8.4 public path scratch smoke OK: 35 denorm targets, 2 FK-path targets, comments blocked, dormant unset/empty permit, org A/B isolation.'
`;
}

assertSafeScratchUrl(scratchUrl);

if (process.argv.includes("--print-sql")) {
  process.stdout.write(renderSmokeSql());
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "p0-8-4-smoke-"));
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
