#!/usr/bin/env node
/**
 * B4 locked runtime principal smoke.
 *
 * Scratch-only live proof that the Node runtime principal carrier from packages/db-principal
 * can install and clear the P2-B protected context through real disposable app-role connections.
 */

import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const dbPrincipalPackagePath = path.join(repoRoot, "packages/db-principal");
const opsSqlPath = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");
const dbPrincipalRuntimePath = path.join(repoRoot, "packages/db-principal/dist/index.js");
const pgBinDir = "/usr/lib/postgresql/16/bin";

const requireFromWebapp = createRequire(path.join(repoRoot, "apps/webapp/package.json"));
const { Client } = requireFromWebapp("pg");

run("pnpm", ["--dir", dbPrincipalPackagePath, "run", "build"], {
  label: "pnpm --dir packages/db-principal run build",
});

const {
  applyCurrentDbPrincipalToConnection,
  buildDbPrincipalApplyOptions,
  clearDbPrincipalFromConnection,
  runWithDbIntegratorPrincipal,
  runWithDbPatientPrincipal,
  runWithDbStaffPrincipal,
} = await import(`${pathToFileURL(dbPrincipalRuntimePath).href}?smoke=${Date.now()}`);

const scratchSuffix = `p${process.pid}_${randomBytes(4).toString("hex")}`.toLowerCase();
const dbName = `bcb_saas_b4_locked_runtime_scratch_${scratchSuffix}`;
const ownerRole = `bcb_saas_b4_owner_scratch_${scratchSuffix}`;
const staffRole = `bcb_saas_b4_staff_scratch_${scratchSuffix}`;
const patientRole = `bcb_saas_b4_patient_scratch_${scratchSuffix}`;
const appStaffRole = "app_staff";
const appPatientRole = "app_patient";
const staffPassword = randomBytes(32).toString("base64url");
const patientPassword = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("hex");
const tempClusterRoot = `/tmp/${dbName}_pg`;
const tempClusterDataDir = path.join(tempClusterRoot, "data");
const tempClusterSocketDir = path.join(tempClusterRoot, "socket");
const tempClusterPort = String(55432 + (process.pid % 1000));

const orgId = "20000000-0000-4000-8000-000000000001";
const otherOrgId = "20000000-0000-4000-8000-000000000002";
const staffPlatformUserId = "20000000-0000-4000-8000-0000000000f1";
const patientPlatformUserId = "20000000-0000-4000-8000-0000000000a1";
const otherPatientPlatformUserId = "20000000-0000-4000-8000-0000000000a2";
const integratorUserId = "424242690";
let createdAppStaffRole = false;
let createdAppPatientRole = false;
let pgHarness = null;

for (const name of [dbName, ownerRole, staffRole, patientRole]) {
  assertSafeScratchName(name);
}

assertMissingSigningSecretFailsBeforeDbUse();
installSignalCleanup();

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertSafeScratchName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_scratch_[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing unsafe scratch resource name: ${name}`);
  }

  const normalized = name.toLowerCase();
  const forbiddenExact = new Set([
    "bcb_webapp_prod",
    "bcb_webapp_test",
    "bcb_webapp_dev",
    "bersoncarebot_prod",
    "bersoncarebot_test",
    "bersoncarebot_dev",
    "production",
    "prod",
    "test",
    "dev",
  ]);
  if (forbiddenExact.has(normalized)) {
    throw new Error(`refusing prod/test/dev-shaped resource name: ${name}`);
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    throw new Error(`refusing prod/test/dev-shaped resource name: ${name}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMissingSigningSecretFailsBeforeDbUse() {
  let dbTouched = false;
  const fakeClient = {
    async query() {
      dbTouched = true;
      throw new Error("fake DB should not be touched");
    },
  };

  try {
    const options = buildDbPrincipalApplyOptions({ mode: "locked" });
    void options;
  } catch (error) {
    assert(!dbTouched, "missing signing secret check touched DB unexpectedly");
    assert(
      error instanceof Error && error.message.includes("DB_PRINCIPAL_SIGNING_SECRET"),
      "missing signing secret must fail with the expected configuration error",
    );
    void fakeClient;
    return;
  }

  throw new Error("missing signing secret did not fail");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
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

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed with ${result.status ?? "unknown status"}`);
  }

  return result;
}

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
}

function safeRun(command, args, options = {}) {
  const result = runResult(command, args, options);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
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

function psql(sql, { database = dbName } = {}) {
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

function psqlScalar(sql, { database = "postgres" } = {}) {
  if (!pgHarness) throw new Error("PostgreSQL harness is not initialized");
  const result =
    pgHarness.kind === "host"
      ? runCaptured("sudo", [
          "-n",
          "-u",
          "postgres",
          "psql",
          "-t",
          "-A",
          "-v",
          "ON_ERROR_STOP=1",
          "-d",
          database,
        ], {
          input: sql,
        })
      : runCaptured(path.join(pgBinDir, "psql"), [
          "-h",
          tempClusterSocketDir,
          "-p",
          tempClusterPort,
          "-t",
          "-A",
          "-v",
          "ON_ERROR_STOP=1",
          "-d",
          database,
        ], {
          input: sql,
        });
  return result.stdout.trim();
}

function psqlFile(filePath, variables, { database = dbName } = {}) {
  if (!pgHarness) throw new Error("PostgreSQL harness is not initialized");
  const sql = readFileSync(filePath, "utf8");
  const input = `${buildPsqlVariablePrelude(variables)}\n${sql}`;
  if (pgHarness.kind === "host") {
    run("sudo", [
      "-n",
      "-u",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database,
    ], {
      input,
      label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
    });
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
  ], {
    input,
    label: `psql -h ${tempClusterSocketDir} -p ${tempClusterPort} -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
  });
}

function buildPsqlVariablePrelude(variables) {
  const assignments = Object.entries(variables).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new Error(`unsafe psql variable key: ${key}`);
    }
    return `  ${quoteLiteral(value)} AS ${key}`;
  });

  return `SELECT\n${assignments.join(",\n")}\n\\gset`;
}

function makeClient(role, password) {
  const base = {
    database: dbName,
    password,
    ssl: false,
    user: role,
  };
  if (pgHarness?.kind === "temp") {
    return new Client({
      ...base,
      host: tempClusterSocketDir,
      port: Number(tempClusterPort),
    });
  }
  return new Client({
    ...base,
    host: "127.0.0.1",
    port: 5432,
  });
}

async function withClient(role, password, fn) {
  const client = makeClient(role, password);
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      [
        `could not connect to scratch DB as disposable role ${role}`,
        "local pg_hba must allow localhost password auth for this live smoke",
        `postgres error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("; "),
    );
  }

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function readHelperContext(client) {
  const result = await client.query(`
    SELECT
      app.current_org_id()::text AS org_id,
      app.current_patient_user_id()::text AS patient_user_id,
      app.current_integrator_user_id()::text AS integrator_user_id,
      app.is_staff() AS is_staff
  `);
  const row = result.rows[0];
  return {
    integratorUserId: row.integrator_user_id ?? null,
    isStaff: row.is_staff,
    orgId: row.org_id ?? null,
    patientUserId: row.patient_user_id ?? null,
  };
}

async function assertCleared(client, expectedStaff, label) {
  const context = await readHelperContext(client);
  assert(context.orgId === null, `${label}: release must clear org helper`);
  assert(context.patientUserId === null, `${label}: release must clear patient helper`);
  assert(context.integratorUserId === null, `${label}: release must clear integrator helper`);
  assert(context.isStaff === expectedStaff, `${label}: release must not spoof role-derived app.is_staff()`);
}

async function readVisibleRuntimeRows(client) {
  const result = await client.query("SELECT label FROM public.b4_locked_runtime_rows ORDER BY label");
  return result.rows.map((row) => row.label);
}

async function assertScopedReadFailsClosed(client, label) {
  try {
    assertLabels(await readVisibleRuntimeRows(client), [], label);
  } catch (error) {
    assert(
      error instanceof Error && /permission denied|violates row-level security/i.test(error.message),
      `${label}; expected zero rows or permission denial, got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertLabels(actual, expected, message) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const lockedOptions = buildDbPrincipalApplyOptions({
  mode: "locked",
  signingSecret,
  ttlMs: 120_000,
  nonce: () => `b4_${randomUUID()}`,
});
const shadowOptions = buildDbPrincipalApplyOptions({
  mode: "shadow",
  signingSecret,
  ttlMs: 120_000,
  nonce: () => `b4_shadow_${randomUUID()}`,
});
const legacyOptions = buildDbPrincipalApplyOptions({
  mode: "legacy-guc",
});

async function proveStaffPrincipal() {
  await withClient(staffRole, staffPassword, async (client) => {
    await runWithDbStaffPrincipal({ organizationId: orgId, platformUserId: staffPlatformUserId }, async () => {
      const applied = await applyCurrentDbPrincipalToConnection(client, lockedOptions);
      assert(applied === true, "staff principal should be applied");
    });

    const context = await readHelperContext(client);
    assert(context.orgId === orgId, "staff principal must install org helper");
    assert(context.patientUserId === null, "staff principal must not install patient helper");
    assert(context.integratorUserId === null, "staff principal must not install integrator helper");
    assert(context.isStaff === true, "staff app role must be role-derived staff");
    assertLabels(
      await readVisibleRuntimeRows(client),
      ["org1_patient_a", "org1_patient_b"],
      "staff principal must see only its organization rows",
    );

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, true, "staff principal");
  });
  console.log("CONFIRMED: locked staff principal sees only its organization rows.");
}

async function provePatientPrincipal() {
  await withClient(patientRole, patientPassword, async (client) => {
    await runWithDbPatientPrincipal({ platformUserId: patientPlatformUserId }, async () => {
      const applied = await applyCurrentDbPrincipalToConnection(client, lockedOptions);
      assert(applied === true, "patient principal should be applied");
    });

    await client.query("SELECT set_config('app.is_staff', 'true', false)");
    const context = await readHelperContext(client);
    assert(context.orgId === null, "patient principal must not install org helper");
    assert(context.patientUserId === patientPlatformUserId, "patient principal must install patient helper");
    assert(context.integratorUserId === null, "patient principal must not install integrator helper");
    assert(context.isStaff === false, "patient app role must not become staff through principal or raw GUC");
    assertLabels(
      await readVisibleRuntimeRows(client),
      ["org1_patient_a", "org2_patient_a"],
      "patient principal must see only its own rows across organizations",
    );

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, false, "patient principal");
  });
  console.log("CONFIRMED: locked patient principal sees only its own rows across organizations.");
}

async function proveIntegratorPrincipal() {
  await withClient(staffRole, staffPassword, async (client) => {
    await runWithDbIntegratorPrincipal({ organizationId: orgId, integratorUserId }, async () => {
      const applied = await applyCurrentDbPrincipalToConnection(client, lockedOptions);
      assert(applied === true, "integrator principal should be applied");
    });

    const context = await readHelperContext(client);
    assert(context.orgId === orgId, "integrator principal must install org helper");
    assert(context.patientUserId === null, "integrator principal must not install patient helper");
    assert(context.integratorUserId === integratorUserId, "integrator principal must install integrator helper");
    assert(context.isStaff === false, "integrator principal must use the patient runtime role");

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, true, "integrator principal");
  });
  console.log("CONFIRMED: locked integrator principal installs and clears protected context.");
}

async function proveLockedMissingPrincipalFailsClosed() {
  await withClient(staffRole, staffPassword, async (client) => {
    let failedClosed = false;
    try {
      await applyCurrentDbPrincipalToConnection(client, lockedOptions);
    } catch (error) {
      failedClosed =
        error instanceof Error &&
        error.message.includes("DB principal context is required before scoped DB access in locked mode");
    }
    assert(failedClosed, "locked mode without a principal must fail closed before scoped DB access");
    await assertScopedReadFailsClosed(client, "locked no-principal scoped read must fail closed");
    await assertCleared(client, true, "locked missing principal");
  });
  console.log("CONFIRMED: locked no-principal scoped read fails closed.");
}

async function proveShadowMissingPrincipalLogs() {
  await withClient(staffRole, staffPassword, async (client) => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message, ...args) => {
      warnings.push(String(message));
      originalWarn.call(console, message, ...args);
    };
    try {
      const applied = await applyCurrentDbPrincipalToConnection(client, shadowOptions);
      assert(applied === false, "shadow mode without a principal must not install context");
    } finally {
      console.warn = originalWarn;
    }
    assert(
      warnings.some((message) => message.includes("DB principal context is missing before scoped DB access in shadow mode")),
      "shadow mode without a principal must log the missing-principal condition",
    );
    await assertCleared(client, true, "shadow missing principal");
  });
  console.log("CONFIRMED: shadow missing-principal request logs and stays non-blocking.");
}

async function proveLegacyGucMissingPrincipalStaysCompatible() {
  await withClient(staffRole, staffPassword, async (client) => {
    const applied = await applyCurrentDbPrincipalToConnection(client, legacyOptions);
    assert(applied === false, "legacy-guc without a principal must preserve historical no-op behavior");
    await assertCleared(client, true, "legacy-guc missing principal");
  });
  console.log("CONFIRMED: legacy-guc missing-principal compatibility is unchanged.");
}

let cleanupStarted = false;

function cleanupScratchResources() {
  if (cleanupStarted) {
    return;
  }
  cleanupStarted = true;

  const cleanupSql = [
    `DROP ROLE IF EXISTS ${quoteIdent(patientRole)};`,
    `DROP ROLE IF EXISTS ${quoteIdent(staffRole)};`,
    `DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};`,
    createdAppPatientRole ? `DROP ROLE IF EXISTS ${quoteIdent(appPatientRole)};` : "",
    createdAppStaffRole ? `DROP ROLE IF EXISTS ${quoteIdent(appStaffRole)};` : "",
    "",
  ].join("\n");

  if (!pgHarness || pgHarness.kind === "host") {
    safeRun("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
    safeRun("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
      input: cleanupSql,
    });
    return;
  }

  safeRun(path.join(pgBinDir, "dropdb"), ["-h", tempClusterSocketDir, "-p", tempClusterPort, "--if-exists", dbName]);
  safeRun(path.join(pgBinDir, "psql"), [
    "-h",
    tempClusterSocketDir,
    "-p",
    tempClusterPort,
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    "postgres",
  ], {
    input: cleanupSql,
  });
  safeRun(path.join(pgBinDir, "pg_ctl"), ["-D", tempClusterDataDir, "-m", "fast", "-w", "stop"]);
  if (tempClusterRoot.startsWith("/tmp/bcb_saas_")) {
    safeRun("rm", ["-rf", tempClusterRoot]);
  }
}

function installSignalCleanup() {
  process.once("SIGINT", () => {
    cleanupScratchResources();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanupScratchResources();
    process.exit(143);
  });
}

try {
  createScratchDatabase();
  createdAppStaffRole = psqlScalar("SELECT (NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff'))::int;") === "1";
  createdAppPatientRole =
    psqlScalar("SELECT (NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient'))::int;") === "1";
  psql(
    [
      `CREATE ROLE ${quoteIdent(ownerRole)} NOLOGIN NOBYPASSRLS;`,
      createdAppStaffRole ? `CREATE ROLE ${quoteIdent(appStaffRole)} LOGIN NOBYPASSRLS;` : "",
      createdAppPatientRole ? `CREATE ROLE ${quoteIdent(appPatientRole)} LOGIN NOBYPASSRLS;` : "",
      `CREATE ROLE ${quoteIdent(staffRole)} LOGIN NOINHERIT PASSWORD ${quoteLiteral(staffPassword)} NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(patientRole)} LOGIN NOINHERIT PASSWORD ${quoteLiteral(patientPassword)} NOBYPASSRLS;`,
      `GRANT ${quoteIdent(appStaffRole)} TO ${quoteIdent(staffRole)};`,
      `GRANT ${quoteIdent(appPatientRole)} TO ${quoteIdent(staffRole)};`,
      `GRANT ${quoteIdent(appPatientRole)} TO ${quoteIdent(patientRole)};`,
      "",
    ].join("\n"),
  );

  console.log("--- b4: applying P2-B protected context artifact to scratch DB ---");
  psqlFile(opsSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: appStaffRole,
    p2_b_patient_role: appPatientRole,
    p2_b_signing_secret: signingSecret,
  });
  psql(`
GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(ownerRole)};
GRANT USAGE ON SCHEMA app TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT EXECUTE ON FUNCTION app.is_staff() TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
`);

  console.log("--- b4: creating scratch RLS rows for locked runtime isolation proof ---");
  psql(`
CREATE TABLE public.b4_locked_runtime_rows (
  id integer PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_user_id uuid NOT NULL,
  label text NOT NULL
);

INSERT INTO public.b4_locked_runtime_rows (id, organization_id, patient_user_id, label)
VALUES
  (1, ${quoteLiteral(orgId)}::uuid, ${quoteLiteral(patientPlatformUserId)}::uuid, 'org1_patient_a'),
  (2, ${quoteLiteral(orgId)}::uuid, ${quoteLiteral(otherPatientPlatformUserId)}::uuid, 'org1_patient_b'),
  (3, ${quoteLiteral(otherOrgId)}::uuid, ${quoteLiteral(otherPatientPlatformUserId)}::uuid, 'org2_patient_b'),
  (4, ${quoteLiteral(otherOrgId)}::uuid, ${quoteLiteral(patientPlatformUserId)}::uuid, 'org2_patient_a');

ALTER TABLE public.b4_locked_runtime_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b4_locked_runtime_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY b4_locked_runtime_staff_rows
  ON public.b4_locked_runtime_rows
  FOR SELECT
  TO ${quoteIdent(appStaffRole)}
  USING (organization_id = app.current_org_id());

CREATE POLICY b4_locked_runtime_patient_rows
  ON public.b4_locked_runtime_rows
  FOR SELECT
  TO ${quoteIdent(appPatientRole)}
  USING (patient_user_id = app.current_patient_user_id());

GRANT USAGE ON SCHEMA public TO ${quoteIdent(appStaffRole)}, ${quoteIdent(appPatientRole)};
GRANT SELECT ON public.b4_locked_runtime_rows TO ${quoteIdent(appStaffRole)}, ${quoteIdent(appPatientRole)};
`);

  console.log("--- b4: proving locked runtime staff principal through disposable staff role ---");
  await proveStaffPrincipal();

  console.log("--- b4: proving locked runtime patient principal through disposable patient role ---");
  await provePatientPrincipal();

  console.log("--- b4: proving locked runtime integrator principal through disposable staff role ---");
  await proveIntegratorPrincipal();

  console.log("--- b4: proving locked missing-principal requests fail closed ---");
  await proveLockedMissingPrincipalFailsClosed();

  console.log("--- b4: proving shadow missing-principal requests are logged ---");
  await proveShadowMissingPrincipalLogs();

  console.log("--- b4: proving legacy-guc missing-principal compatibility ---");
  await proveLegacyGucMissingPrincipalStaysCompatible();

  console.log(`smoke-b4-locked-runtime-principal: OK (${dbName})`);
} finally {
  cleanupScratchResources();
}
