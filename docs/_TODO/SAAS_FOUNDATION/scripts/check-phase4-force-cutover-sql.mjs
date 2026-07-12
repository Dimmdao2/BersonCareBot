#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = "apps/webapp/db/drizzle-migrations";
const cutoverSqlPath = "deploy/postgres/phase4-force-rls-cutover.sql";
const noForceCompatMigrationPath = "apps/webapp/db/drizzle-migrations/0177_phase4_no_force_rls_compat.sql";
const deploySaas667Path = "scripts/deploy-saas-667.sh";
const migrationFilePattern = /^(016\d|017[0-6])_.*\.sql$/;
const enableRlsPattern = /ALTER\s+TABLE\s+((?:"[^"]+"\.)?"[^"]+")\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
const forceRlsPattern = /FORCE\s+ROW\s+LEVEL\s+SECURITY/i;
const noForceStatementPattern = /ALTER\s+TABLE\s+((?:"[^"]+"\.)?"[^"]+")\s+NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
const cutoverTargetPattern = /\('((?:''|[^'])+)'\)/g;

const forbiddenCutoverFragments = [
  "/opt/env",
  "api.prod",
  "webapp.prod",
  "bcb_webapp_prod",
  "bcb_webapp_dev",
  "bcb_webapp_test",
];

function fail(message) {
  throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function assertIncludes(source, fragment, label) {
  if (!source.includes(fragment)) {
    fail(`${label} must include ${fragment}`);
  }
}

function assertOrdered(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  if (earlierIndex === -1 || laterIndex === -1 || earlierIndex >= laterIndex) {
    fail(`${label} must contain ${earlier} before ${later}`);
  }
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => migrationFilePattern.test(file))
  .sort();

const expectedPrefixes = Array.from({ length: 17 }, (_, index) => String(160 + index).padStart(4, "0"));
const actualPrefixes = migrationFiles.map((file) => file.slice(0, 4));

if (JSON.stringify(actualPrefixes) !== JSON.stringify(expectedPrefixes)) {
  fail(`Expected exactly one migration for 0160-0176, got: ${migrationFiles.join(", ")}`);
}

const enableTargets = [];

for (const file of migrationFiles) {
  const path = join(migrationsDir, file);
  const sql = readFileSync(path, "utf8");

  if (forceRlsPattern.test(sql)) {
    fail(`${path} must not contain FORCE ROW LEVEL SECURITY; dormant compatibility migrations must stay NO FORCE`);
  }

  for (const match of sql.matchAll(enableRlsPattern)) {
    enableTargets.push(match[1]);
  }
}

const expectedTargets = unique(enableTargets);

if (expectedTargets.length === 0) {
  fail("Expected at least one ENABLE ROW LEVEL SECURITY target in migrations 0160-0176");
}

const cutoverSql = readFileSync(cutoverSqlPath, "utf8");
const noForceCompatMigrationSql = readFileSync(noForceCompatMigrationPath, "utf8");
const deploySaas667Sql = readFileSync(deploySaas667Path, "utf8");

for (const fragment of forbiddenCutoverFragments) {
  if (cutoverSql.includes(fragment)) {
    fail(`${cutoverSqlPath} must not reference ${fragment}`);
  }
}

assertIncludes(cutoverSql, "\\set ON_ERROR_STOP on", cutoverSqlPath);
assertIncludes(cutoverSql, "\\set phase4_force_rls_down 0", cutoverSqlPath);
assertIncludes(cutoverSql, ":'phase4_force_rls_down' IN ('0', '1')", cutoverSqlPath);
assertIncludes(cutoverSql, "\\if :phase4_force_rls_down", cutoverSqlPath);
assertOrdered(cutoverSql, "SELECT 1 / (:'phase4_force_rls_down' IN ('0', '1'))::int", "BEGIN;", cutoverSqlPath);
assertOrdered(cutoverSql, "BEGIN;", "COMMIT;", cutoverSqlPath);

const branchMatch = cutoverSql.match(/\\if :phase4_force_rls_down\n(?<down>[\s\S]*?)\\else\n(?<up>[\s\S]*?)\\endif/);
if (!branchMatch?.groups) {
  fail(`${cutoverSqlPath} must branch on \\if :phase4_force_rls_down with explicit down/up branches`);
}

const downBranch = branchMatch.groups.down;
const upBranch = branchMatch.groups.up;
const forceFormat = "SELECT format('ALTER TABLE %s FORCE ROW LEVEL SECURITY;', target)";
const noForceFormat = "SELECT format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY;', target)";

assertIncludes(downBranch, noForceFormat, `${cutoverSqlPath} rollback branch`);
assertIncludes(upBranch, forceFormat, `${cutoverSqlPath} default branch`);

if (downBranch.includes(forceFormat)) {
  fail(`${cutoverSqlPath} rollback branch must not apply FORCE ROW LEVEL SECURITY`);
}

if (upBranch.includes(noForceFormat)) {
  fail(`${cutoverSqlPath} default branch must not apply NO FORCE ROW LEVEL SECURITY`);
}

const gexecCount = [...cutoverSql.matchAll(/^\\gexec$/gm)].length;
if (gexecCount !== 2) {
  fail(`${cutoverSqlPath} must execute exactly two generated statement branches, got ${gexecCount}`);
}

const cutoverTargets = [];

for (const match of cutoverSql.matchAll(cutoverTargetPattern)) {
  cutoverTargets.push(match[1].replaceAll("''", "'"));
}

const duplicateCutoverTargets = cutoverTargets.filter((target, index) => cutoverTargets.indexOf(target) !== index);

if (duplicateCutoverTargets.length > 0) {
  fail(`${cutoverSqlPath} has duplicate targets: ${unique(duplicateCutoverTargets).join(", ")}`);
}

const missingInCutover = expectedTargets.filter((target) => !cutoverTargets.includes(target));
const extraInCutover = cutoverTargets.filter((target) => !expectedTargets.includes(target));

if (missingInCutover.length > 0 || extraInCutover.length > 0) {
  const details = [
    missingInCutover.length > 0 ? `missing: ${missingInCutover.join(", ")}` : "",
    extraInCutover.length > 0 ? `extra: ${extraInCutover.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  fail(`${cutoverSqlPath} target list must match unique ENABLE RLS targets from 0160-0176 (${details})`);
}

const noForceCompatTargets = [];
for (const match of noForceCompatMigrationSql.matchAll(noForceStatementPattern)) {
  noForceCompatTargets.push(match[1]);
}

const missingInNoForceCompat = expectedTargets.filter((target) => !noForceCompatTargets.includes(target));
const extraInNoForceCompat = noForceCompatTargets.filter((target) => !expectedTargets.includes(target));

if (missingInNoForceCompat.length > 0 || extraInNoForceCompat.length > 0) {
  const details = [
    missingInNoForceCompat.length > 0 ? `missing: ${missingInNoForceCompat.join(", ")}` : "",
    extraInNoForceCompat.length > 0 ? `extra: ${extraInNoForceCompat.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  fail(`${noForceCompatMigrationPath} target list must match unique ENABLE RLS targets from 0160-0176 (${details})`);
}

assertIncludes(deploySaas667Sql, "legacyForceHashes", deploySaas667Path);
assertIncludes(deploySaas667Sql, "required_drizzle_hash_groups", deploySaas667Path);
assertIncludes(deploySaas667Sql, "0115..0177", deploySaas667Path);
assertIncludes(deploySaas667Sql, "expected at least 178", deploySaas667Path);
assertIncludes(deploySaas667Sql, "0177_phase4_no_force_rls_compat", deploySaas667Path);

console.log(`check-phase4-force-cutover-sql: OK (${expectedTargets.length} targets)`);
