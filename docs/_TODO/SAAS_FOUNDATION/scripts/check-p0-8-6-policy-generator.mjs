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
const gucSql = "NULLIF(current_setting('app.org', true), '')";

if (descriptors.length !== 4) {
  fail(`Expected 4 P0.8.6 descriptors, got ${descriptors.length}`);
}

if (expectedP086BootstrapHybridTargets.length !== 4) {
  fail(`Expected 4 explicit P0.8.6 targets, got ${expectedP086BootstrapHybridTargets.length}`);
}

if (statements.length !== descriptors.length * 4) {
  fail(`Expected ${descriptors.length * 4} policy statements, got ${statements.length}`);
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

  if (!sql.includes(`ALTER TABLE ${quotedTarget} FORCE ROW LEVEL SECURITY;`)) {
    fail(`Missing FORCE RLS statement for ${descriptor.table}`);
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

if (!sql.includes(`${gucSql} IS NOT NULL AND "organization_id" = ${gucSql}::uuid`)) {
  fail("P0.8.6 generated SQL must require non-empty app.org for organization rows");
}

if (sql.includes(`${gucSql} IS NULL OR "organization_id"`)) {
  fail("P0.8.6 generated SQL must not use dormant permissive all-row semantics");
}

console.log("P0.8.6 policy generator OK: 4 BOOTSTRAP hybrid targets with global-or-matching-org predicate.");
