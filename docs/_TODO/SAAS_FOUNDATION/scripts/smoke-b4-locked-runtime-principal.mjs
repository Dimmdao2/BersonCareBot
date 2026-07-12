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
const staffPassword = randomBytes(32).toString("base64url");
const patientPassword = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("hex");

const orgId = "20000000-0000-4000-8000-000000000001";
const staffPlatformUserId = "20000000-0000-4000-8000-0000000000f1";
const patientPlatformUserId = "20000000-0000-4000-8000-0000000000a1";
const integratorUserId = "424242690";

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

function psql(sql, { database = dbName } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
}

function psqlFile(filePath, variables, { database = dbName } = {}) {
  const sql = readFileSync(filePath, "utf8");
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
    input: `${buildPsqlVariablePrelude(variables)}\n${sql}`,
    label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
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
  return new Client({
    database: dbName,
    host: "127.0.0.1",
    password,
    port: 5432,
    ssl: false,
    user: role,
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

const lockedOptions = buildDbPrincipalApplyOptions({
  mode: "locked",
  signingSecret,
  ttlMs: 120_000,
  nonce: () => `b4_${randomUUID()}`,
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

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, true, "staff principal");
  });
}

async function provePatientPrincipal() {
  await withClient(patientRole, patientPassword, async (client) => {
    await runWithDbPatientPrincipal({ organizationId: orgId, platformUserId: patientPlatformUserId }, async () => {
      const applied = await applyCurrentDbPrincipalToConnection(client, lockedOptions);
      assert(applied === true, "patient principal should be applied");
    });

    await client.query("SELECT set_config('app.is_staff', 'true', false)");
    const context = await readHelperContext(client);
    assert(context.orgId === orgId, "patient principal must install org helper");
    assert(context.patientUserId === patientPlatformUserId, "patient principal must install patient helper");
    assert(context.integratorUserId === null, "patient principal must not install integrator helper");
    assert(context.isStaff === false, "patient app role must not become staff through principal or raw GUC");

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, false, "patient principal");
  });
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
    assert(context.isStaff === true, "integrator proof uses the disposable staff app role");

    await clearDbPrincipalFromConnection(client, lockedOptions);
    await assertCleared(client, true, "integrator principal");
  });
}

let cleanupStarted = false;

function cleanupScratchResources() {
  if (cleanupStarted) {
    return;
  }
  cleanupStarted = true;

  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: [
      `DROP ROLE IF EXISTS ${quoteIdent(patientRole)};`,
      `DROP ROLE IF EXISTS ${quoteIdent(staffRole)};`,
      `DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};`,
      "",
    ].join("\n"),
  });
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
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(
    [
      `CREATE ROLE ${quoteIdent(ownerRole)} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(staffRole)} LOGIN PASSWORD ${quoteLiteral(staffPassword)} NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(patientRole)} LOGIN PASSWORD ${quoteLiteral(patientPassword)} NOBYPASSRLS;`,
      "",
    ].join("\n"),
  );

  console.log("--- b4: applying P2-B protected context artifact to scratch DB ---");
  psqlFile(opsSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: signingSecret,
  });

  console.log("--- b4: proving locked runtime staff principal through disposable staff role ---");
  await proveStaffPrincipal();

  console.log("--- b4: proving locked runtime patient principal through disposable patient role ---");
  await provePatientPrincipal();

  console.log("--- b4: proving locked runtime integrator principal through disposable staff role ---");
  await proveIntegratorPrincipal();

  console.log(`smoke-b4-locked-runtime-principal: OK (${dbName})`);
} finally {
  cleanupScratchResources();
}
