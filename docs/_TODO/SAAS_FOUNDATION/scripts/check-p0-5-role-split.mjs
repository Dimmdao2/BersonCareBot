#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { buildRlsDescriptors, readTierRows } from "./rls-descriptor-model.mjs";
import {
  getP05AppGrantTables,
  p05DedicatedRoleTables,
  renderP05RoleSplitSql,
} from "./p0-5-role-split-sql.mjs";

const docPath = "docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md";
const proofPath = "docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql";
const opsSqlPath = "deploy/postgres/p0-5-role-split.sql";

const expectedCounts = Object.freeze({
  SCOPED: 161,
  BOOTSTRAP: 27,
});

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`Missing required ${label} fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
      fail(`${label} must not include forbidden fragment: ${fragment}`);
    }
  }
}

function forbidExecutableSqlFragments(label, sql, fragments) {
  const executableSql = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  forbidFragments(label, executableSql, fragments);
}

function countByTier(tables) {
  const counts = new Map();

  for (const table of tables) {
    counts.set(table.tier, (counts.get(table.tier) ?? 0) + 1);
  }

  return counts;
}

function assertGrantSetMatchesTiers() {
  if (
    p05DedicatedRoleTables.size !== 3 ||
    !p05DedicatedRoleTables.has("public.app_runtime_settings") ||
    !p05DedicatedRoleTables.has("public.app_runtime_settings_audit") ||
    !p05DedicatedRoleTables.has("public.staff_security_profiles")
  ) {
    fail("P0.5 dedicated-role exclusion must contain only the S5 runtime tables and staff-security vault");
  }

  const grantTables = getP05AppGrantTables();
  const grantTableNames = new Set(grantTables.map((table) => table.qualifiedName));
  const tierRows = readTierRows();
  const expectedTables = new Set(
    tierRows
      .filter((row) => row.tier === "SCOPED" || row.tier === "BOOTSTRAP")
      .map((row) => row.table)
      .filter((table) => !p05DedicatedRoleTables.has(table)),
  );

  if (grantTableNames.has("public.app_runtime_settings")) {
    fail("P0.5 generic app role must not receive app_runtime_settings; it uses dedicated audience-aware roles");
  }
  if (grantTableNames.has("public.app_runtime_settings_audit")) {
    fail("P0.5 generic app role must not receive app_runtime_settings_audit; it is staff-only");
  }
  if (grantTableNames.has("public.staff_security_profiles")) {
    fail("P0.5 generic app role must not receive staff_security_profiles; it is function-only");
  }

  if (grantTableNames.size !== expectedTables.size) {
    fail(`Expected ${expectedTables.size} P0.5 app grant tables, got ${grantTableNames.size}`);
  }

  for (const table of expectedTables) {
    if (!grantTableNames.has(table)) {
      fail(`P0.5 app grant table missing from generated grant set: ${table}`);
    }
  }

  for (const table of grantTableNames) {
    if (!expectedTables.has(table)) {
      fail(`P0.5 app grant table is not SCOPED/BOOTSTRAP: ${table}`);
    }
  }

  const counts = countByTier(grantTables);

  for (const [tier, expectedCount] of Object.entries(expectedCounts)) {
    const actual = counts.get(tier) ?? 0;

    if (actual !== expectedCount) {
      fail(`Expected ${expectedCount} P0.5 ${tier} grant tables, got ${actual}`);
    }
  }

  for (const tier of counts.keys()) {
    if (expectedCounts[tier] == null) {
      fail(`Unexpected P0.5 app grant tier: ${tier}`);
    }
  }
}

function runChecks({ doc = read(docPath), proof = read(proofPath), opsSql = read(opsSqlPath) } = {}) {
  const renderedSql = renderP05RoleSplitSql({ descriptors: buildRlsDescriptors() });

  requireFragments("P0.5 doc", doc, [
    "Status: P0.5 / B5 materialized dormant ops artifact. Dormant; no runtime role flip.",
    "deploy/postgres/p0-5-role-split.sql",
    "operator-chosen role names",
    "Must be `NOBYPASSRLS`",
    "No app runtime `DATABASE_URL` change.",
    "No runtime role switch.",
    "No dev/prod DB write.",
  ]);

  requireFragments("P0.5 proof", proof, [
    "current_database() LIKE 'bcb_saas_%'",
    "scratch",
    "SELECT 1 / 0 AS p0_5_abort",
    "rolsuper OR rolcreaterole",
    "CREATE ROLE :\"p0_5_app_role\" NOLOGIN NOBYPASSRLS;",
    "ALTER TABLE p0_5_role_split_proof.scoped_rows FORCE ROW LEVEL SECURITY;",
    "current_setting('app.org', true)",
    "SET LOCAL ROLE :\"p0_5_app_role\";",
    "RESET ROLE;",
    "ROLLBACK;",
  ]);

  requireFragments("P0.5 ops SQL", opsSql, [
    "CREATE ROLE %I NOLOGIN BYPASSRLS",
    "CREATE ROLE %I LOGIN BYPASSRLS",
    "CREATE ROLE %I LOGIN NOBYPASSRLS",
    "SELECT rolsuper::int AS p0_5_can_manage_roles",
    "ALTER ROLE :\"p0_5_app_role\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
    "GRANT :\"p0_5_owner_role\" TO :\"p0_5_migrator_role\";",
    "REVOKE :\"p0_5_owner_role\" FROM :\"p0_5_app_role\";",
    "REVOKE :\"p0_5_migrator_role\" FROM :\"p0_5_app_role\";",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO %I",
    "GRANT USAGE, SELECT ON SEQUENCE %I.%I TO %I",
    "\\if :{?p0_5_down}",
    "DROP ROLE %I",
    "P0.5 role split UP complete: 161 SCOPED tables and 27 BOOTSTRAP tables granted to the app role.",
  ]);

  forbidFragments("P0.5 proof", proof, [
    "/opt/env/bersoncarebot",
    "api.prod",
    "webapp.prod",
    "bcb_webapp_prod",
    "bcb_webapp_dev",
  ]);

  forbidFragments("P0.5 ops SQL", opsSql, [
    "/opt/env/bersoncarebot",
    "api.prod",
    "webapp.prod",
    "bcb_webapp_prod",
    "bcb_webapp_dev",
    "ALTER ROLE :\"p0_5_app_role\" BYPASSRLS",
    "SUPERUSER BYPASSRLS",
  ]);

  forbidExecutableSqlFragments("P0.5 ops SQL executable body", opsSql, [
    "REASSIGN OWNED",
    "DROP OWNED",
  ]);

  if (opsSql !== renderedSql) {
    fail(`${opsSqlPath} is not synchronized with p0-5-role-split-sql.mjs output`);
  }

  assertGrantSetMatchesTiers();
}

function runSelfTest() {
  const doc = read(docPath);
  const proof = read(proofPath);
  const opsSql = read(opsSqlPath);

  const cases = [
    {
      name: "missing app NOBYPASSRLS",
      args: {
        doc,
        proof,
        opsSql: opsSql.replace(
          "ALTER ROLE :\"p0_5_app_role\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
          "ALTER ROLE :\"p0_5_app_role\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;",
        ),
      },
    },
    {
      name: "missing generated artifact doc link",
      args: {
        doc: doc.replaceAll("deploy/postgres/p0-5-role-split.sql", "deploy/postgres/missing.sql"),
        proof,
        opsSql,
      },
    },
    {
      name: "unsafe destructive rollback",
      args: {
        doc,
        proof,
        opsSql: `${opsSql}\nREASSIGN OWNED BY :"p0_5_app_role" TO :"p0_5_owner_role";\n`,
      },
    },
  ];

  for (const selfTestCase of cases) {
    let failed = false;

    try {
      runChecks(selfTestCase.args);
    } catch {
      failed = true;
    }

    if (!failed) {
      fail(`self-test did not detect ${selfTestCase.name}`);
    }
  }
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("P0.5 role split self-test OK.");
} else {
  runChecks();
  console.log("P0.5 role split contract/proof/ops artifacts OK.");
  console.log("P0.5 app grant tables: SCOPED=161 BOOTSTRAP=27.");
}
