#!/usr/bin/env node
/**
 * R2 real-policy isolation smoke.
 *
 * Applies the real deploy artifact `deploy/postgres/phase4-locked-helper-rls-policies.sql` on a
 * fresh disposable scratch DB, with P2-B protected principal helpers installed first. The schema is
 * a generated policy-surface stub: every Phase 4 wall target table exists, so the full artifact is
 * applied, not a sampled in-memory simulation.
 *
 * Proves:
 *   - default artifact mode is dormant-compatible for no-context legacy sessions;
 *   - strict cutover mode + FORCE isolates org A from org B;
 *   - patient P1 cannot see patient P2 in the same org;
 *   - plain SET app.org/app.patient_user_id does not forge visibility;
 *   - releasing the locked context under strict mode fails closed.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { getPhase4LockedPolicyTargets } = await import(path.join(__dirname, "phase4-locked-policy-artifact.mjs"));

const stamp = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_r2_locked_scratch_${stamp}`;
const ownerRole = `r2_locked_owner_${stamp}`;
const staffRole = `r2_locked_staff_${stamp}`;
const patientRole = `r2_locked_patient_${stamp}`;
const signingSecret = "scratch_locked_context_secret_0123456789abcdef";
const pgBinDir = "/usr/lib/postgresql/16/bin";
const tempClusterRoot = `/tmp/${dbName}_pg`;
const tempClusterDataDir = path.join(tempClusterRoot, "data");
const tempClusterSocketDir = path.join(tempClusterRoot, "socket");
const tempClusterPort = String(55432 + (process.pid % 1000));

let pgHarness = null;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("_scratch_")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: options.input,
  });
}

function safeRun(command, args, options = {}) {
  const result = runResult(command, args, options);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function createScratchDatabase() {
  const hostCreatedb = runResult("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  if (hostCreatedb.status === 0) {
    pgHarness = { kind: "host" };
    return;
  }

  const hostError = `${hostCreatedb.stdout ?? ""}${hostCreatedb.stderr ?? ""}`;
  if (!/no new privileges|sudo\.conf|permission denied/i.test(hostError)) {
    if (hostCreatedb.stdout) process.stdout.write(hostCreatedb.stdout);
    if (hostCreatedb.stderr) process.stderr.write(hostCreatedb.stderr);
    throw new Error(`sudo -n -u postgres createdb ${dbName} failed with ${hostCreatedb.status ?? "unknown status"}`);
  }

  process.stderr.write(hostError);
  console.log("--- host sudo unavailable in this sandbox; starting private /tmp PostgreSQL cluster ---");
  run("mkdir", ["-p", tempClusterDataDir, tempClusterSocketDir]);
  run(path.join(pgBinDir, "initdb"), ["-D", tempClusterDataDir, "-A", "trust", "--no-locale"]);
  run(path.join(pgBinDir, "pg_ctl"), [
    "-D",
    tempClusterDataDir,
    "-o",
    `-k ${tempClusterSocketDir} -p ${tempClusterPort} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  run(path.join(pgBinDir, "createdb"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, dbName]);
  pgHarness = { kind: "temp" };
}

function psql(sql, database = dbName) {
  if (!pgHarness) throw new Error("PostgreSQL harness is not initialized");

  if (pgHarness.kind === "host") {
    run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
    return;
  }

  run(path.join(pgBinDir, "psql"), [
    "-h",
    tempClusterSocketDir,
    "-p",
    tempClusterPort,
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    database,
  ], { input: sql });
}

function psqlFile(relPath, extraArgs = []) {
  if (!pgHarness) throw new Error("PostgreSQL harness is not initialized");

  if (pgHarness.kind === "host") {
    // Read the SQL ourselves and pipe via stdin: the `postgres` OS user cannot read
    // repo files under /home/dev (perm-denied on `-f <repo path>`), but we can.
    run(
      "sudo",
      [
        "-n",
        "-u",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        ...extraArgs,
        "-d",
        dbName,
      ],
      { input: readFileSync(relPath, "utf8") },
    );
    return;
  }

  run(path.join(pgBinDir, "psql"), [
    "-h",
    tempClusterSocketDir,
    "-p",
    tempClusterPort,
    "-v",
    "ON_ERROR_STOP=1",
    ...extraArgs,
    "-d",
    dbName,
    "-f",
    relPath,
  ]);
}

function cleanupScratchDatabase() {
  if (!pgHarness) return;

  if (pgHarness.kind === "host") {
    safeRun("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
    safeRun("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
      input: `
DROP ROLE IF EXISTS ${quoteIdent(patientRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffRole)};
DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};
`,
    });
    return;
  }

  safeRun(path.join(pgBinDir, "dropdb"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, "--if-exists", dbName]);
  safeRun(path.join(pgBinDir, "psql"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: `
DROP ROLE IF EXISTS ${quoteIdent(patientRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffRole)};
DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};
`,
  });
  safeRun(path.join(pgBinDir, "pg_ctl"), ["-D", tempClusterDataDir, "-m", "fast", "-w", "stop"]);
  if (tempClusterRoot.startsWith("/tmp/bcb_saas_")) {
    safeRun("rm", ["-rf", tempClusterRoot]);
  }
}

function createRolesSql() {
  return `
CREATE ROLE ${quoteIdent(ownerRole)} NOLOGIN NOBYPASSRLS;
CREATE ROLE ${quoteIdent(staffRole)} NOLOGIN NOBYPASSRLS;
CREATE ROLE ${quoteIdent(patientRole)} NOLOGIN NOBYPASSRLS;
`;
}

function columnTypeForPatientCast(castType = "uuid") {
  return castType === "bigint" ? "bigint" : "uuid";
}

function defaultPkType(table, column) {
  if (table === "integrator.identities" && column === "id") return "bigint";
  return "uuid";
}

function addColumn(columnsByTable, table, column, type) {
  if (!columnsByTable.has(table)) columnsByTable.set(table, new Map());

  const columns = columnsByTable.get(table);
  const existing = columns.get(column);
  if (existing && existing !== type) {
    throw new Error(`Column type conflict for ${table}.${column}: ${existing} vs ${type}`);
  }

  columns.set(column, type);
}

function addBaseTable(columnsByTable, table) {
  addColumn(columnsByTable, table, "id", defaultPkType(table, "id"));
}

function addHopColumns(columnsByTable, outerTable, hops, terminalColumn, castType = "uuid") {
  hops.forEach((hop, index) => {
    const parentPkType = defaultPkType(hop.table, hop.parentPk);
    const localTable = index === 0 ? outerTable : hops[index - 1].table;

    addBaseTable(columnsByTable, hop.table);
    addColumn(columnsByTable, localTable, hop.localFk, parentPkType);
    addColumn(columnsByTable, hop.table, hop.parentPk, parentPkType);

    if (index === hops.length - 1) {
      addColumn(columnsByTable, hop.table, terminalColumn, columnTypeForPatientCast(castType));
    }
  });
}

function collectPolicySurfaceColumns() {
  const columnsByTable = new Map();

  for (const { descriptor } of getPhase4LockedPolicyTargets()) {
    addBaseTable(columnsByTable, descriptor.table);

    if (descriptor.orgColumn) {
      addColumn(columnsByTable, descriptor.table, descriptor.orgColumn, "uuid");
    }

    if (descriptor.fkPath) {
      addBaseTable(columnsByTable, descriptor.fkPath.parentTable);
      addBaseTable(columnsByTable, descriptor.fkPath.crossCheckTable);
      addColumn(columnsByTable, descriptor.table, descriptor.fkPath.localFk, "uuid");
      addColumn(columnsByTable, descriptor.table, descriptor.fkPath.crossCheckLocalFk, "uuid");
      addColumn(columnsByTable, descriptor.fkPath.parentTable, descriptor.fkPath.parentPk, "uuid");
      addColumn(columnsByTable, descriptor.fkPath.parentTable, descriptor.fkPath.parentOrgColumn, "uuid");
      addColumn(columnsByTable, descriptor.fkPath.crossCheckTable, descriptor.fkPath.crossCheckPk, "uuid");
      addColumn(columnsByTable, descriptor.fkPath.crossCheckTable, descriptor.fkPath.crossCheckOrgColumn, "uuid");
    }

    if (descriptor.patientColumn) {
      addColumn(
        columnsByTable,
        descriptor.scopingKind === "fk_path" ? descriptor.fkPath.parentTable : descriptor.table,
        descriptor.patientColumn,
        columnTypeForPatientCast(descriptor.patientColumnCastType),
      );
    }

    if (descriptor.patientChain) {
      addHopColumns(
        columnsByTable,
        descriptor.table,
        descriptor.patientChain.hops,
        descriptor.patientChain.terminalColumn,
        descriptor.patientChain.castType,
      );
    }

    if (descriptor.patientConditionalChain) {
      const { hop, patientColumn, castType, discriminatorColumn } = descriptor.patientConditionalChain;
      addBaseTable(columnsByTable, hop.table);
      addColumn(columnsByTable, descriptor.table, hop.localFk, defaultPkType(hop.table, hop.parentPk));
      addColumn(columnsByTable, hop.table, hop.parentPk, defaultPkType(hop.table, hop.parentPk));
      addColumn(columnsByTable, hop.table, patientColumn, columnTypeForPatientCast(castType));
      addColumn(columnsByTable, hop.table, discriminatorColumn, "text");
    }

    if (descriptor.patientConditional) {
      addColumn(
        columnsByTable,
        descriptor.table,
        descriptor.patientConditional.patientColumn,
        columnTypeForPatientCast(descriptor.patientConditional.castType),
      );
      addColumn(columnsByTable, descriptor.table, descriptor.patientConditional.discriminatorColumn, "text");
    }

    if (descriptor.patientPolymorphic) {
      addColumn(columnsByTable, descriptor.table, descriptor.patientPolymorphic.typeColumn, "text");
      for (const variant of descriptor.patientPolymorphic.variants) {
        addHopColumns(columnsByTable, descriptor.table, variant.hops, variant.terminalColumn, variant.castType);
      }
    }
  }

  addBaseTable(columnsByTable, "public.be_organizations");
  addColumn(columnsByTable, "public.be_organizations", "organization_id", "uuid");
  addBaseTable(columnsByTable, "public.platform_users");
  addBaseTable(columnsByTable, "integrator.identities");
  addColumn(columnsByTable, "integrator.identities", "user_id", "bigint");

  return new Map([...columnsByTable.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function createPolicySurfaceSchemaSql() {
  const statements = ["CREATE SCHEMA IF NOT EXISTS integrator;"];

  for (const [table, columns] of collectPolicySurfaceColumns()) {
    const [schema, name] = table.split(".");
    const columnSql = [...columns.entries()].map(([column, type]) => `${quoteIdent(column)} ${type}`).join(",\n  ");
    statements.push(`CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(name)} (\n  ${columnSql}\n);`);
  }

  statements.push(`
GRANT USAGE ON SCHEMA public, integrator TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA integrator TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
`);

  return statements.join("\n\n");
}

const orgA = "b6000000-0000-4000-8000-0000000000a1";
const orgB = "b6000000-0000-4000-8000-0000000000b1";
const patientA1 = "b6000000-0000-4000-8000-00000000a101";
const patientA2 = "b6000000-0000-4000-8000-00000000a102";
const patientB1 = "b6000000-0000-4000-8000-00000000b101";
const rowA1 = "b6100000-0000-4000-8000-000000000001";
const rowA2 = "b6100000-0000-4000-8000-000000000002";
const rowB1 = "b6100000-0000-4000-8000-000000000003";
const writeProbe = "b6100000-0000-4000-8000-000000000004";

const fixtureSql = `
INSERT INTO public.be_organizations (id, organization_id) VALUES
  ('${orgA}'::uuid, '${orgA}'::uuid),
  ('${orgB}'::uuid, '${orgB}'::uuid);

INSERT INTO public.platform_users (id) VALUES
  ('${patientA1}'::uuid),
  ('${patientA2}'::uuid),
  ('${patientB1}'::uuid);

INSERT INTO public.org_enrollments (id, organization_id, platform_user_id) VALUES
  ('${rowA1}'::uuid, '${orgA}'::uuid, '${patientA1}'::uuid),
  ('${rowA2}'::uuid, '${orgA}'::uuid, '${patientA2}'::uuid),
  ('${rowB1}'::uuid, '${orgB}'::uuid, '${patientB1}'::uuid);

INSERT INTO public.notification_delivery_attempts (id, organization_id, user_id) VALUES
  ('${rowA1}'::uuid, '${orgA}'::uuid, '${patientA1}'::uuid),
  ('${rowA2}'::uuid, '${orgA}'::uuid, '${patientA2}'::uuid),
  ('${rowB1}'::uuid, '${orgB}'::uuid, '${patientB1}'::uuid);
`;

function installContextSql({ role, nonce, orgId, patientId = null, integratorUserId = null }) {
  const patientCanonical = patientId ?? "";
  const integratorCanonical = integratorUserId == null ? "" : String(integratorUserId);
  const patientArg = patientId == null ? "NULL::uuid" : `'${patientId}'::uuid`;
  const integratorArg = integratorUserId == null ? "NULL::bigint" : `${integratorUserId}::bigint`;

  return `
RESET ROLE;
SELECT pg_backend_pid() AS ctx_pid, (floor(extract(epoch FROM clock_timestamp()))::bigint + 240) AS ctx_exp \\gset
SELECT encode(
  app_ext.hmac(
    concat_ws('|', 'v1', '${nonce}', (:ctx_pid)::text, (:ctx_exp)::text, '${orgId}', '${patientCanonical}', '${integratorCanonical}'),
    '${signingSecret}',
    'sha256'
  ),
  'hex'
) AS ctx_sig \\gset
SET ROLE ${quoteIdent(role)};
SET row_security = on;
SELECT app.install_signed_context('${nonce}', (:ctx_pid)::integer, (:ctx_exp)::bigint, '${orgId}'::uuid, ${patientArg}, ${integratorArg}, :'ctx_sig');
`;
}

function assertSql() {
  return String.raw`
\set ON_ERROR_STOP on

SELECT (current_database() LIKE 'bcb_saas_%' AND current_database() LIKE '%_scratch_%')::int AS scratch_db_ok \gset
\if :scratch_db_ok
\else
\echo 'FATAL: smoke-r2-real-policy-isolation must run only on bcb_saas_*_scratch_* databases.'
SELECT 1/0;
\endif

SET ROLE ${quoteIdent(patientRole)};
SET row_security = on;
RESET app.org;
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT (count(*) = 3)::int AS dormant_read_count_ok FROM public.org_enrollments \gset
\if :dormant_read_count_ok
\else
\echo 'FATAL: default locked-helper artifact must remain dormant-compatible when no locked context exists.'
SELECT 1/0;
\endif

INSERT INTO public.notification_delivery_attempts (id, organization_id, user_id)
VALUES ('${writeProbe}'::uuid, '${orgA}'::uuid, '${patientA1}'::uuid);

SELECT (count(*) = 1)::int AS dormant_write_ok FROM public.notification_delivery_attempts WHERE id = '${writeProbe}'::uuid \gset
\if :dormant_write_ok
\else
\echo 'FATAL: default dormant-compatible policy must allow legacy no-context writes before cutover.'
SELECT 1/0;
\endif

\echo 'R2 smoke (a) CONFIRMED: no principal context set -> clinic #1-style legacy reads/writes still work in dormant-compatible artifact mode.'
`;
}

function strictAssertionSql() {
  return String.raw`
\set ON_ERROR_STOP on

${installContextSql({ role: staffRole, nonce: `staff_${stamp}`, orgId: orgA })}

SELECT (count(*) = 2)::int AS staff_org_a_count_ok FROM public.org_enrollments \gset
\if :staff_org_a_count_ok
\else
\echo 'FATAL: staff with locked org A context must see org A rows.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS staff_org_b_hidden_ok FROM public.org_enrollments WHERE organization_id = '${orgB}'::uuid \gset
\if :staff_org_b_hidden_ok
\else
\echo 'FATAL: staff with locked org A context must not see org B rows.'
SELECT 1/0;
\endif

\echo 'R2 smoke (b) CONFIRMED: FORCE + locked org A context cannot see org B rows.'

${installContextSql({ role: patientRole, nonce: `patient_a1_${stamp}`, orgId: orgA, patientId: patientA1 })}

SELECT (app.current_org_id() = '${orgA}'::uuid AND app.current_patient_user_id() = '${patientA1}'::uuid)::int AS helper_context_ok \gset
\if :helper_context_ok
\else
\echo 'FATAL: locked helper context was not installed as expected for patient A1.'
SELECT 1/0;
\endif

SELECT (count(*) = 1)::int AS patient_a1_own_ok FROM public.org_enrollments WHERE platform_user_id = '${patientA1}'::uuid \gset
\if :patient_a1_own_ok
\else
\echo 'FATAL: patient A1 must see its own row.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS patient_a2_hidden_ok FROM public.org_enrollments WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :patient_a2_hidden_ok
\else
\echo 'FATAL: patient A1 must not see patient A2 in the same org.'
SELECT 1/0;
\endif

\echo 'R2 smoke (c) CONFIRMED: patient P1 cannot see patient P2 rows in the same org.'

SET app.org = '${orgB}';
SET app.patient_user_id = '${patientA2}';

SELECT (app.current_org_id() = '${orgA}'::uuid AND app.current_patient_user_id() = '${patientA1}'::uuid)::int AS raw_forge_ignored_ok \gset
\if :raw_forge_ignored_ok
\else
\echo 'FATAL: plain SET app.org/app.patient_user_id changed helper-visible identity.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS forged_patient_a2_still_hidden_ok FROM public.org_enrollments WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :forged_patient_a2_still_hidden_ok
\else
\echo 'FATAL: raw SET app.patient_user_id forged visibility to patient A2.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS forged_org_b_still_hidden_ok FROM public.org_enrollments WHERE organization_id = '${orgB}'::uuid \gset
\if :forged_org_b_still_hidden_ok
\else
\echo 'FATAL: raw SET app.org forged visibility to org B.'
SELECT 1/0;
\endif

\echo 'R2 smoke (d) CONFIRMED: plain SET app.org/app.patient_user_id cannot forge visibility; helpers read app.principal_context.'

SELECT app.release_principal_context();
RESET app.org;
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT (app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL)::int AS released_context_ok \gset
\if :released_context_ok
\else
\echo 'FATAL: release_principal_context did not clear locked helper context.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS strict_unset_denies_ok FROM public.org_enrollments \gset
\if :strict_unset_denies_ok
\else
\echo 'FATAL: strict locked-helper policy must fail closed when context is unset.'
SELECT 1/0;
\endif

\echo 'R2 smoke (e) CONFIRMED: unset locked context under strict enforce mode fails CLOSED.'
\echo 'smoke-r2-real-policy-isolation: assertions OK'
`;
}

try {
  createScratchDatabase();

  console.log("--- phase 0: scratch roles ---");
  psql(createRolesSql(), "postgres");

  console.log("--- phase 1: P2-B protected principal context ---");
  psqlFile("deploy/postgres/p2-b-protected-principal-context.sql", [
    "-v",
    `p2_b_owner_role=${ownerRole}`,
    "-v",
    `p2_b_staff_role=${staffRole}`,
    "-v",
    `p2_b_patient_role=${patientRole}`,
    "-v",
    `p2_b_signing_secret=${signingSecret}`,
  ]);

  // Mirror deploy-saas-667.sh Step 1 (superuser): p2-b no longer self-grants app_ext USAGE
  // (that owner-only GRANT must run as superuser on the real non-superuser migrator path).
  psql(`GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(ownerRole)};`);

  console.log("--- phase 2: generated policy-surface schema ---");
  psql(createPolicySurfaceSchemaSql());

  console.log("--- phase 3: apply locked-helper artifact in dormant-compatible mode twice ---");
  psqlFile("deploy/postgres/phase4-locked-helper-rls-policies.sql");
  psqlFile("deploy/postgres/phase4-locked-helper-rls-policies.sql");

  console.log("--- phase 4: seed two orgs and two same-org patients ---");
  psql(fixtureSql);

  console.log("--- phase 5: dormant compatibility assertions ---");
  psql(assertSql());

  console.log("--- phase 6: apply strict locked-helper artifact twice + FORCE cutover ---");
  psqlFile("deploy/postgres/phase4-locked-helper-rls-policies.sql", ["-v", "phase4_enforce_locked_context=1"]);
  psqlFile("deploy/postgres/phase4-locked-helper-rls-policies.sql", ["-v", "phase4_enforce_locked_context=1"]);
  psqlFile("deploy/postgres/phase4-force-rls-cutover.sql");

  console.log("--- phase 7: strict isolation and un-forgeability assertions ---");
  psql(strictAssertionSql());

  console.log(`smoke-r2-real-policy-isolation: OK (${dbName})`);
} finally {
  cleanupScratchDatabase();
}
