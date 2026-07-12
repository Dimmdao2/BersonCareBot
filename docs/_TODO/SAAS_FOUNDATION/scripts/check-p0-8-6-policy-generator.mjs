#!/usr/bin/env node

import {
  expectedP086BootstrapHybridTargets,
  getP086BootstrapHybridDescriptors,
  p086PolicyName,
  renderP086PolicyStatements,
} from "./p0-8-6-policy-targets.mjs";

function fail(message) {
  throw new Error(message);
}

const descriptors = getP086BootstrapHybridDescriptors();
const statements = renderP086PolicyStatements({ descriptors });
const sql = statements.join("\n");
const orgContextSql = "app.current_org_id()";

if (descriptors.length !== 5) {
  fail(`Expected 5 P0.8.6 descriptors, got ${descriptors.length}`);
}

if (expectedP086BootstrapHybridTargets.length !== 5) {
  fail(`Expected 5 explicit P0.8.6 targets, got ${expectedP086BootstrapHybridTargets.length}`);
}

if (statements.length !== descriptors.length * 3) {
  fail(`Expected ${descriptors.length * 3} dormant policy statements, got ${statements.length}`);
}

if (sql.includes("FORCE ROW LEVEL SECURITY")) {
  fail("P0.8.6 dormant generated SQL must not include FORCE ROW LEVEL SECURITY");
}

for (const descriptor of descriptors) {
  if (descriptor.scopingKind !== "bootstrap_hybrid") {
    fail(`Unexpected P0.8.6 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
  }

  if (descriptor.tier !== "BOOTSTRAP") {
    fail(`Unexpected P0.8.6 tier for ${descriptor.table}: ${descriptor.tier}`);
  }

  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");

  if (!sql.includes(`ALTER TABLE ${quotedTarget} ENABLE ROW LEVEL SECURITY;`)) {
    fail(`Missing ENABLE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`DROP POLICY IF EXISTS "${p086PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p086PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (!sql.includes('"organization_id" IS NULL')) {
  fail("P0.8.6 generated SQL must always allow global NULL organization rows");
}

if (!sql.includes(`${orgContextSql} IS NOT NULL AND "organization_id" = ${orgContextSql}`)) {
  fail("P0.8.6 generated SQL must require app.current_org_id() for organization rows");
}

if (sql.includes(`${orgContextSql} IS NULL OR "organization_id"`)) {
  fail("P0.8.6 generated SQL must not use dormant permissive all-row semantics");
}

console.log("P0.8.6 policy generator OK: 5 BOOTSTRAP hybrid targets with global-or-matching-org predicate.");
