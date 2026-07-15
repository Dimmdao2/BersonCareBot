#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repoRoot = process.cwd();
const artifactPath = "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql";
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_d3_4_helper_scratch_${suffix}`;
const bootstrapRole = `bcb_d3_4_bootstrap_${suffix}`;
const mediaRole = `bcb_d3_4_media_${suffix}`;
const staffRole = `bcb_d3_4_staff_${suffix}`;
const patientRole = `bcb_d3_4_patient_${suffix}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error("unsafe_scratch_database_name");
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(database, sql) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], sql);
}

const bootstrapIdent = quoteIdent(bootstrapRole);
const mediaIdent = quoteIdent(mediaRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const sourceArtifact = readFileSync(artifactPath, "utf8");
const artifact = sourceArtifact
  .replaceAll("app_staff", staffRole)
  .replaceAll("app_patient", patientRole);

const functionSignatures = [...artifact.matchAll(/ON FUNCTION\s+(app\.[^(\s]+\([^;]*?\))\s+(?:TO|FROM)/g)]
  .map((match) => match[1])
  .concat([
    "app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)",
    "app.reset_principal_context()",
  ])
  .filter((signature, index, all) => all.indexOf(signature) === index);
const tableNames = [...artifact.matchAll(/ON TABLE\s+(public\.[a-zA-Z0-9_]+)/g)]
  .map((match) => match[1])
  .filter((table, index, all) => all.indexOf(table) === index);

const setupSql = [
  `CREATE ROLE ${bootstrapIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${mediaIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${staffIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `CREATE ROLE ${patientIdent} NOLOGIN NOSUPERUSER NOBYPASSRLS;`,
  `GRANT ${patientIdent} TO ${bootstrapIdent};`,
  "CREATE SCHEMA app;",
  `GRANT USAGE ON SCHEMA app TO ${staffIdent}, ${patientIdent};`,
  ...functionSignatures.map(
    (signature) => `CREATE FUNCTION ${signature} RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;`,
  ),
  "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;",
  `GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${staffIdent}, ${patientIdent};`,
  ...tableNames.map((table) => `CREATE TABLE ${table} (id integer);`),
].join("\n");

const applySql = [
  `\\set d3_4_bootstrap_base_role ${bootstrapRole}`,
  `\\set d3_4_media_worker_runtime_role ${mediaRole}`,
  artifact,
].join("\n");

const proofSql = `
SELECT 1 / has_function_privilege(${quoteLiteral(staffRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(bootstrapRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(patientRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.staff_user_has_password_credentials(uuid)', 'EXECUTE'))::int;
SELECT 1 / has_function_privilege(${quoteLiteral(mediaRole)}, 'app.release_principal_context()', 'EXECUTE')::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.current_org_id()', 'EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege(${quoteLiteral(mediaRole)}, 'app.reset_principal_context()', 'EXECUTE'))::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1
  FROM pg_proc proc
  CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
  WHERE proc.oid IN (
    'app.staff_user_has_password_credentials(uuid)'::regprocedure,
    'app.release_principal_context()'::regprocedure
  )
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
))::int;
SET SESSION AUTHORIZATION ${mediaIdent};
SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION ${staffIdent};
SELECT app.staff_user_has_password_credentials('00000000-0000-4000-8000-000000000001'::uuid);
RESET SESSION AUTHORIZATION;
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(dbName, setupSql);
  psql(dbName, applySql);
  psql(dbName, proofSql);
  process.stdout.write("smoke-d3-4-runtime-helper-grants: OK\n");
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  psql("postgres", [
    `DROP ROLE IF EXISTS ${bootstrapIdent};`,
    `DROP ROLE IF EXISTS ${mediaIdent};`,
    `DROP ROLE IF EXISTS ${staffIdent};`,
    `DROP ROLE IF EXISTS ${patientIdent};`,
  ].join("\n"));
}
