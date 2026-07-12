#!/usr/bin/env node
/**
 * P2-B protected principal context smoke.
 *
 * Scratch-only proof that applies deploy/postgres/p2-b-protected-principal-context.sql and then
 * proves the locked-context helper contract. It creates a disposable database and disposable roles,
 * refuses dev/prod/test-shaped DB names, and drops scratch resources in finally.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const opsSqlPath = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_p2_b_context_scratch_${scratchSuffix}`;
const ownerRole = `bcb_p2_b_context_owner_${scratchSuffix}`;
const staffRole = `bcb_p2_b_app_staff_${scratchSuffix}`;
const patientRole = `bcb_p2_b_app_patient_${scratchSuffix}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)|bersoncarebot_test/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = dbName } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
}

function psqlFile(filePath, variables, { database = dbName } = {}) {
  const sql = readFileSync(filePath, "utf8");
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  run("sudo", [
    "-n",
    "-u",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    database,
    ...variableArgs,
  ], {
    input: sql,
    label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
  });
}

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    "\\else",
    `\\echo 'FATAL: ${message}'`,
    "SELECT 1/0; -- forces a real error under ON_ERROR_STOP",
    "\\endif",
  ].join("\n");
}

const ownerIdent = quoteIdent(ownerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const secret = randomBytes(32).toString("hex");

const orgA = "10000000-0000-4000-8000-0000000000a1";
const orgB = "10000000-0000-4000-8000-0000000000b1";
const patientA1 = "10000000-0000-4000-8000-00000000a101";
const patientA2 = "10000000-0000-4000-8000-00000000a102";
const integratorUserId = "424242001";
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const expiredEpoch = Math.floor(Date.now() / 1000) - 60;

const validNonce = `valid_${scratchSuffix}`;
const secondValidNonce = `valid2_${scratchSuffix}`;
const badNonce = `bad_${scratchSuffix}`;
const nullSignatureNonce = `null_signature_${scratchSuffix}`;
const expiredNonce = `expired_${scratchSuffix}`;
const wrongBackendNonce = `wrong_backend_${scratchSuffix}`;

const proofSql = String.raw`
SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(validNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_b_valid_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(secondValidNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_b_second_valid_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(expiredNonce)},
    pg_backend_pid()::text,
    ${expiredEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_b_expired_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(wrongBackendNonce)},
    (pg_backend_pid() + 1)::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_b_wrong_backend_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};

SELECT (app.is_staff() = false)::int AS p2_b_patient_not_staff \gset
${fatal("p2_b_patient_not_staff", "app_patient must not be staff through app.is_staff()")}

SET app.is_staff = 'true';
SELECT (app.is_staff() = false)::int AS p2_b_staff_guc_ignored \gset
${fatal("p2_b_staff_guc_ignored", "raw app.is_staff GUC must not affect role-derived app.is_staff()")}

\set ON_ERROR_STOP off
SELECT count(*) FROM app.principal_context;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: app_patient cannot read app.principal_context.'
\else
\echo 'FATAL: app_patient could read app.principal_context.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO app.principal_context (
  backend_pid,
  org_id,
  patient_user_id,
  integrator_user_id,
  nonce,
  expires_epoch
) VALUES (
  pg_backend_pid(),
  ${quoteLiteral(orgB)},
  ${quoteLiteral(patientA2)},
  999,
  'direct_write',
  ${futureEpoch}
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: app_patient cannot write app.principal_context.'
\else
\echo 'FATAL: app_patient could write app.principal_context.'
SELECT 1/0;
\endif

SET app.org = ${quoteLiteral(orgB)};
SET app.patient_user_id = ${quoteLiteral(patientA2)};
SET app.integrator_user_id = '999';
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p2_b_raw_gucs_untrusted_before_install \gset
${fatal("p2_b_raw_gucs_untrusted_before_install", "raw custom GUC SET must not install trusted helper context")}

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(badNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  '00bad'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: bad signature rejected.'
\else
\echo 'FATAL: bad signature accepted.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(nullSignatureNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  NULL
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: NULL signature rejected.'
\else
\echo 'FATAL: NULL signature accepted.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(expiredNonce)},
  pg_backend_pid(),
  ${expiredEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p2_b_expired_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: expired signature rejected.'
\else
\echo 'FATAL: expired signature accepted.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(wrongBackendNonce)},
  pg_backend_pid() + 1,
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p2_b_wrong_backend_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: wrong-backend signature rejected.'
\else
\echo 'FATAL: wrong-backend signature accepted.'
SELECT 1/0;
\endif

SELECT app.install_signed_context(
  ${quoteLiteral(validNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p2_b_valid_signature'
);

SELECT (
  app.current_org_id() = ${quoteLiteral(orgA)}::uuid
  AND app.current_patient_user_id() = ${quoteLiteral(patientA1)}::uuid
  AND app.current_integrator_user_id() = ${integratorUserId}::bigint
)::int AS p2_b_valid_signed_payload_installed \gset
${fatal("p2_b_valid_signed_payload_installed", "valid signed payload must install helper-visible context")}

SET app.org = ${quoteLiteral(orgB)};
SET app.patient_user_id = ${quoteLiteral(patientA2)};
SET app.integrator_user_id = '999';
SELECT (
  app.current_org_id() = ${quoteLiteral(orgA)}::uuid
  AND app.current_patient_user_id() = ${quoteLiteral(patientA1)}::uuid
  AND app.current_integrator_user_id() = ${integratorUserId}::bigint
)::int AS p2_b_raw_gucs_untrusted_after_install \gset
${fatal("p2_b_raw_gucs_untrusted_after_install", "raw custom GUC SET must not override helper context")}

SELECT app.reset_principal_context();
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p2_b_reset_clears_context \gset
${fatal("p2_b_reset_clears_context", "reset cleanup must clear backend context")}

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(validNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p2_b_valid_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: replayed signature rejected.'
\else
\echo 'FATAL: replayed signature accepted.'
SELECT 1/0;
\endif

SELECT app.install_signed_context(
  ${quoteLiteral(secondValidNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p2_b_second_valid_signature'
);
SELECT app.release_principal_context();
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p2_b_release_clears_context \gset
${fatal("p2_b_release_clears_context", "release cleanup must clear backend context")}

RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION ${staffIdent};
SELECT (app.is_staff() = true)::int AS p2_b_staff_role_is_staff \gset
${fatal("p2_b_staff_role_is_staff", "staff role must be staff through role-derived app.is_staff()")}
RESET SESSION AUTHORIZATION;

\echo 'P2-B protected context smoke: all assertions CONFIRMED.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(
    [
      `CREATE ROLE ${ownerIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;`,
      "",
    ].join("\n"),
  );

  console.log("--- p2-b: applying reusable protected context artifact ---");
  psqlFile(opsSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });

  console.log("--- p2-b: proving protected context behavior under disposable app roles ---");
  psql(proofSql);

  console.log(`smoke-p2-b-protected-context: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: [
      `DROP ROLE IF EXISTS ${patientIdent};`,
      `DROP ROLE IF EXISTS ${staffIdent};`,
      `DROP ROLE IF EXISTS ${ownerIdent};`,
      "",
    ].join("\n"),
  });
}
