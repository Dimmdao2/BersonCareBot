#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const requireFromWebapp = createRequire(path.join(repoRoot, "apps/webapp/package.json"));

const urlEnv = "PHASE4_REHEARSAL_DATABASE_URL";
const allowedHostsEnv = "PHASE4_REHEARSAL_ALLOWED_HOSTS";
const migrationsDir = path.join(repoRoot, "apps/webapp/db/drizzle-migrations");
const compatMigration = "0177_phase4_no_force_rls_compat.sql";
const migrationFilePattern = /^(016\d|017[0-6])_.*\.sql$/;
const enableRlsPattern = /ALTER\s+TABLE\s+"([^"]+)"\."([^"]+)"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
const safeDbPattern = /^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/;
const unsafeNameTokenPattern = /(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/;
const unsafeHostTokenPattern = /(^|[.-])(prod|production)([.-]|$)/;
const forbiddenConnectionOverrideParams = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "passfile",
  "service",
  "sslcert",
  "sslkey",
]);
const explicitlyForbiddenDbNames = new Set([
  "bcb_webapp_prod", "bcb_webapp_test", "bcb_webapp_dev",
  "bersoncarebot_prod", "bersoncarebot_test", "bersoncarebot_dev",
  "prod", "production", "test", "dev",
]);
const protectedHelperSignatures = [
  {
    signature: "app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)",
    returns: "void",
    securityDefiner: true,
    searchPath: "search_path=app, app_ext, pg_catalog",
  },
  {
    signature: "app.current_org_id()",
    returns: "uuid",
    securityDefiner: true,
    searchPath: "search_path=app, pg_catalog",
  },
  {
    signature: "app.current_patient_user_id()",
    returns: "uuid",
    securityDefiner: true,
    searchPath: "search_path=app, pg_catalog",
  },
  {
    signature: "app.current_integrator_user_id()",
    returns: "bigint",
    securityDefiner: true,
    searchPath: "search_path=app, pg_catalog",
  },
  {
    signature: "app.reset_principal_context()",
    returns: "void",
    securityDefiner: true,
    searchPath: "search_path=app, pg_catalog",
  },
  {
    signature: "app.release_principal_context()",
    returns: "void",
    securityDefiner: true,
    searchPath: "search_path=app, pg_catalog",
  },
  {
    signature: "app.is_staff()",
    returns: "boolean",
    securityDefiner: false,
    searchPath: null,
  },
];

function fail(message) {
  const error = new Error(message);
  error.safeForOutput = true;
  throw error;
}

function parseSafeRehearsalUrl(value) {
  if (!value || !value.trim()) fail(`${urlEnv} is required`);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${urlEnv} is not a valid PostgreSQL URL`);
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    fail(`${urlEnv} must use postgres:// or postgresql://`);
  }

  for (const key of parsed.searchParams.keys()) {
    if (forbiddenConnectionOverrideParams.has(key.toLowerCase())) {
      fail(`${urlEnv} must not contain connection override query parameters`);
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) fail(`${urlEnv} must include a hostname`);
  if (hostname === "135.106.162.170" || unsafeHostTokenPattern.test(hostname)) {
    fail(`${urlEnv} points to a forbidden production-shaped host`);
  }
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    ...String(process.env[allowedHostsEnv] ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
  if (!allowedHosts.has(hostname)) {
    fail(`${urlEnv} hostname is not in the non-production allowlist`);
  }

  let dbName;
  try {
    dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  } catch {
    fail(`${urlEnv} has an invalid database name encoding`);
  }
  if (!dbName) fail(`${urlEnv} must include a database name`);
  if (explicitlyForbiddenDbNames.has(dbName) || unsafeNameTokenPattern.test(dbName)) {
    fail(`${urlEnv} contains a forbidden prod/test/dev-shaped database name`);
  }
  if (!safeDbPattern.test(dbName)) {
    fail(`${urlEnv} database name must match the disposable scratch/rehearsal naming contract`);
  }

  return { connectionString: value, dbName, hostname };
}

function loadRlsTargets() {
  const targets = new Map();
  const files = readdirSync(migrationsDir).filter((file) => migrationFilePattern.test(file)).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    for (const match of sql.matchAll(enableRlsPattern)) {
      targets.set(`${match[1]}.${match[2]}`, { schema: match[1], table: match[2] });
    }
  }
  return [...targets.values()];
}

function compatMigrationHash() {
  return createHash("sha256")
    .update(readFileSync(path.join(migrationsDir, compatMigration)))
    .digest("hex");
}

function assertSelfTestFailure(value) {
  try {
    parseSafeRehearsalUrl(value);
  } catch {
    return;
  }
  fail("safety self-test expected URL rejection");
}

function runSafetySelfTest() {
  const unsafeUrls = [
    "postgres://user:secret@135.106.162.170/bcb_saas_phase4_rehearsal_x",
    "postgres://user:secret@bersoncare.ru/bcb_saas_phase4_rehearsal_x",
    "postgres://user:secret@safe-looking-alias.example/bcb_saas_phase4_rehearsal_x",
    "postgres://user:secret@prod.example/bcb_saas_phase4_rehearsal_x",
    "postgres://user:secret@localhost/bcb_webapp_prod",
    "postgres://user:secret@localhost/bcb_webapp_test",
    "postgres://user:secret@localhost/bcb_webapp_dev",
    "postgres://user:secret@localhost/bersoncarebot_production",
    "postgres://user:secret@localhost/phase4_prod_copy",
    "postgres://user:secret@localhost/test",
    "postgres://user:secret@localhost/dev",
    "postgres://user:secret@localhost/unmarked_copy",
    "postgres://user:secret@localhost/bcb_saas_phase4_rehearsal_x?host=135.106.162.170",
    "postgres://user:secret@localhost/bcb_saas_phase4_rehearsal_x?host=/var/run/postgresql",
    "postgres://user:secret@localhost/bcb_saas_phase4_rehearsal_x?hostaddr=135.106.162.170",
    "postgres://user:secret@localhost/bcb_saas_phase4_rehearsal_x?dbname=bcb_webapp_prod",
    "postgres://user:secret@localhost/bcb_saas_phase4_rehearsal_x?service=prod",
  ];
  for (const value of unsafeUrls) assertSelfTestFailure(value);
  parseSafeRehearsalUrl("postgres://rehearsal:secret@localhost/bcb_saas_phase4_rehearsal_selftest");
  console.log(`[phase4-db-state] safety self-test: PASS (${unsafeUrls.length + 1} cases)`);
}

function valuesClause(rows) {
  const params = [];
  const tuples = rows.map((row, index) => {
    params.push(row.schema, row.table);
    return `($${index * 2 + 1}::text, $${index * 2 + 2}::text)`;
  });
  return { params, sql: tuples.join(", ") };
}

function reportGate(name, count) {
  console.log(`[phase4-db-state] ${name}: PASS (${count})`);
}

async function checkDbState() {
  const safe = parseSafeRehearsalUrl(process.env[urlEnv]);
  const targets = loadRlsTargets();
  if (targets.length !== 161) fail(`static RLS target count mismatch: expected 161, got ${targets.length}`);

  const { Client } = requireFromWebapp("pg");
  const client = new Client({ connectionString: safe.connectionString, application_name: "phase4-prod-copy-db-state-check" });
  try {
    if (client.connectionParameters.host !== safe.hostname || client.connectionParameters.database !== safe.dbName) {
      fail("pg connection parameters do not match the safety-approved host/database");
    }

    await client.connect();

    const databaseResult = await client.query("SELECT current_database() AS name");
    if (databaseResult.rows[0]?.name !== safe.dbName) fail("current_database() does not match the safety-approved database name");
    reportGate("safe_database_identity", 1);

    const migrationResult = await client.query(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE hash = $1",
      [compatMigrationHash()],
    );
    if (migrationResult.rows[0]?.count !== 1) fail("0177 compatibility migration hash is missing or duplicated");
    reportGate("compat_migration_0177_hash", 1);

    const values = valuesClause(targets);
    const rlsResult = await client.query(
      `WITH expected(nspname, relname) AS (VALUES ${values.sql})
       SELECT count(*)::int AS expected_count,
              count(c.oid)::int AS found_count,
              count(*) FILTER (WHERE c.relrowsecurity AND NOT c.relforcerowsecurity)::int AS compatible_count
       FROM expected e
       LEFT JOIN pg_namespace n ON n.nspname = e.nspname
       LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.relname AND c.relkind IN ('r', 'p')`,
      values.params,
    );
    const rls = rlsResult.rows[0];
    if (rls.expected_count !== targets.length || rls.found_count !== targets.length || rls.compatible_count !== targets.length) {
      fail("RLS target catalog state is incomplete or not ENABLE + NO FORCE");
    }
    reportGate("rls_enabled_no_force_targets", targets.length);

    let rolesResult;
    try {
      rolesResult = await client.query(
        `SELECT
           count(*)::int AS count,
           bool_and(rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS attrs_ok,
           NOT pg_has_role('app_patient', 'app_staff', 'MEMBER') AS patient_not_staff
         FROM pg_roles
         WHERE rolname = ANY($1::text[])`,
        [["app_staff", "app_patient"]],
      );
    } catch {
      fail("role catalog inspection failed; checker user must be able to inspect pg_roles");
    }
    if (rolesResult.rows[0]?.count !== 2 || rolesResult.rows[0]?.attrs_ok !== true || rolesResult.rows[0]?.patient_not_staff !== true) {
      fail("required runtime roles are missing, have unsafe attributes, or make app_patient a staff member");
    }
    reportGate("runtime_roles_login_nonsuper_nocreatedb_nocreaterole_noreplication_no_bypassrls", 2);

    const helpersResult = await client.query(
      `WITH expected(signature, returns, security_definer, search_path) AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS x(signature text, returns text, security_definer boolean, search_path text)
       ),
       resolved AS (
         SELECT
           e.*,
           to_regprocedure(e.signature) AS oid
         FROM expected e
       ),
       checked AS (
         SELECT
           r.signature,
           p.oid IS NOT NULL AS exists_ok,
           p.prorettype = r.returns::regtype AS returns_ok,
           p.prosecdef = r.security_definer AS security_ok,
           owner.rolname NOT IN ('app_staff', 'app_patient') AS owner_ok,
           (
             (r.search_path IS NULL AND COALESCE(cardinality(p.proconfig), 0) = 0)
             OR p.proconfig = ARRAY[r.search_path]
           ) AS search_path_ok,
           NOT has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_execute_revoked,
           has_function_privilege('app_staff', p.oid, 'EXECUTE') AS staff_execute_ok,
           has_function_privilege('app_patient', p.oid, 'EXECUTE') AS patient_execute_ok
         FROM resolved r
         LEFT JOIN pg_proc p ON p.oid = r.oid
         LEFT JOIN pg_roles owner ON owner.oid = p.proowner
       )
       SELECT count(*)::int AS count
       FROM checked
       WHERE exists_ok AND returns_ok AND security_ok AND owner_ok AND search_path_ok
         AND public_execute_revoked AND staff_execute_ok AND patient_execute_ok`,
      [JSON.stringify(protectedHelperSignatures)],
    );
    if (helpersResult.rows[0]?.count !== protectedHelperSignatures.length) {
      fail("one or more protected principal context helper signatures, owners, search paths, or grants are invalid");
    }
    reportGate("protected_principal_context_helper_signatures_and_grants", protectedHelperSignatures.length);
  } catch (error) {
    if (error?.safeForOutput) throw error;
    fail("database connection or catalog query failed; details suppressed");
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test-safety") {
    runSafetySelfTest();
    return;
  }
  if (args.length > 0) fail("Usage: check-phase4-prod-copy-db-state.mjs [--self-test-safety]");
  await checkDbState();
  console.log("[phase4-db-state] all catalog gates: PASS (5)");
}

main().catch((error) => {
  console.error(`[phase4-db-state] FAILED: ${error.message}`);
  process.exit(1);
});
