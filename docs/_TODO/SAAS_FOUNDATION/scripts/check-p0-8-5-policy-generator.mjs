#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  expectedP085IntegratorDirectUserBridgeTargets,
  expectedP085IntegratorIdentityBridgeTargets,
  expectedP085IntegratorMailingsRootTargets,
  expectedP085IntegratorParentDenormTargets,
  getP085IntegratorScopedDescriptors,
  p085PolicyName,
  renderP085PolicyStatements,
} from "./p0-8-5-policy-targets.mjs";

const p04MigrationChecks = Object.freeze([
  {
    sourceStage: "P0.4.I1",
    path: "apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql",
    targets: expectedP085IntegratorDirectUserBridgeTargets,
    requiredTokens: [
      "expected no NULL organization_id rows",
      "expected no multi-org direct integrator users",
      "direct-user rows using default-org fallback",
    ],
  },
  {
    sourceStage: "P0.4.I2",
    path: "apps/integrator/src/infra/db/migrations/core/20260708_0002_p0_4_i2_integrator_identity_path_org.sql",
    targets: expectedP085IntegratorIdentityBridgeTargets,
    requiredTokens: [
      "expected no NULL organization_id rows",
      "expected no multi-org identity-path integrator users",
      "identity-path rows using default-org fallback",
    ],
  },
  {
    sourceStage: "P0.4.I3",
    path: "apps/integrator/src/infra/db/migrations/core/20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql",
    targets: expectedP085IntegratorParentDenormTargets,
    requiredTokens: [
      "expected no NULL organization_id rows",
      "expected no child/parent organization mismatches",
    ],
  },
  {
    sourceStage: "P0.4.I4",
    path: "apps/integrator/src/infra/db/migrations/core/20260708_0004_p0_4_i4_integrator_mailings_org.sql",
    targets: expectedP085IntegratorMailingsRootTargets,
    requiredTokens: ["expected no NULL mailings.organization_id rows"],
  },
]);

function fail(message) {
  throw new Error(message);
}

function assertP04MigrationArtifacts() {
  for (const check of p04MigrationChecks) {
    const sql = readFileSync(check.path, "utf8");

    for (const table of check.targets) {
      if (!sql.includes(table)) {
        fail(`${check.sourceStage} migration ${check.path} does not mention ${table}`);
      }
    }

    for (const token of check.requiredTokens) {
      if (!sql.includes(token)) {
        fail(`${check.sourceStage} migration ${check.path} is missing required assertion token: ${token}`);
      }
    }
  }
}

const descriptors = getP085IntegratorScopedDescriptors();
const statements = renderP085PolicyStatements({ descriptors });
const sql = statements.join("\n");

assertP04MigrationArtifacts();

if (descriptors.length !== 13) {
  fail(`Expected 13 P0.8.5 descriptors, got ${descriptors.length}`);
}

if (expectedP085IntegratorDirectUserBridgeTargets.length !== 5) {
  fail(`Expected 5 explicit P0.4.I1 targets, got ${expectedP085IntegratorDirectUserBridgeTargets.length}`);
}

if (expectedP085IntegratorIdentityBridgeTargets.length !== 3) {
  fail(`Expected 3 explicit P0.4.I2 targets, got ${expectedP085IntegratorIdentityBridgeTargets.length}`);
}

if (expectedP085IntegratorParentDenormTargets.length !== 4) {
  fail(`Expected 4 explicit P0.4.I3 targets, got ${expectedP085IntegratorParentDenormTargets.length}`);
}

if (expectedP085IntegratorMailingsRootTargets.length !== 1) {
  fail(`Expected 1 explicit P0.4.I4 target, got ${expectedP085IntegratorMailingsRootTargets.length}`);
}

if (statements.length !== descriptors.length * 4) {
  fail(`Expected ${descriptors.length * 4} policy statements, got ${statements.length}`);
}

for (const descriptor of descriptors) {
  if (!["direct_org_column", "denorm_org_column"].includes(descriptor.scopingKind)) {
    fail(`Unexpected P0.8.5 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
  }

  if (!["P0.4.I1", "P0.4.I2", "P0.4.I3", "P0.4.I4"].includes(descriptor.sourceStage)) {
    fail(`Unexpected P0.8.5 source stage for ${descriptor.table}: ${descriptor.sourceStage}`);
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

  if (!sql.includes(`DROP POLICY IF EXISTS "${p085PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (sql.includes('"public".')) {
  fail("P0.8.5 generated SQL must not target public tables");
}

console.log(
  `P0.8.5 policy generator OK: 13 integrator targets (${expectedP085IntegratorDirectUserBridgeTargets.length} I1, ${expectedP085IntegratorIdentityBridgeTargets.length} I2, ${expectedP085IntegratorParentDenormTargets.length} I3, ${expectedP085IntegratorMailingsRootTargets.length} I4) with P0.4 source artifacts present.`,
);
