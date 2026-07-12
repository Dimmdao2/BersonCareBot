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

if (statements.length !== descriptors.length * 3) {
  fail(`Expected ${descriptors.length * 3} dormant policy statements, got ${statements.length}`);
}

if (sql.includes("FORCE ROW LEVEL SECURITY")) {
  fail("P0.8.5 dormant generated SQL must not include FORCE ROW LEVEL SECURITY");
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

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #653): the I1
// direct-user-bridge targets (contacts, content_access_grants, mailing_logs, user_reminder_rules,
// user_subscriptions) all carry a direct bigint user_id column referencing integrator.users(id) —
// verified against the real CREATE/ALTER TABLE SQL, including the telegram-schema retarget
// migration for mailing_logs/user_subscriptions (see rls-descriptor-model.mjs comment). Helper
// alignment (B4-fanout, taskdb #656): the bigint cast reads the DEDICATED `app.integrator_user_id`
// helper, never the `app.current_patient_user_id()` UUID helper.
//
// The I2 identity-bridge (conversations/message_drafts/user_questions) and I3 parent-denorm
// targets are CHAIN-owned (taskdb #656 gap closure): their patient identity is only reachable via
// a JOIN through integrator.identities (I2) or multiple hops (I3) — see
// rls-descriptor-model.mjs `patientChainOwnedTables`, no longer a documented-open gap.
const expectedPatientOwnedTargets = 5;
const patientOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientColumn);

if (patientOwnedDescriptors.length !== expectedPatientOwnedTargets) {
  fail(`Expected ${expectedPatientOwnedTargets} P0.8.5 patient-owned targets, got ${patientOwnedDescriptors.length}`);
}

for (const descriptor of patientOwnedDescriptors) {
  if (descriptor.sourceStage !== "P0.4.I1") {
    fail(`${descriptor.table} patient-owned target must be a P0.4.I1 direct-user-bridge table, got ${descriptor.sourceStage}`);
  }

  if (descriptor.patientColumnCastType !== "bigint") {
    fail(`${descriptor.table} integrator patient column must cast to bigint, got ${descriptor.patientColumnCastType}`);
  }

  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const createStatement = statements.find(
    (statement) => statement.startsWith(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes("app.is_staff()")) {
    fail(`${descriptor.table} patient-owned policy must include the fail-closed staff-or-patient branch`);
  }

  if (!createStatement.includes(`"${descriptor.patientColumn}" = app.current_integrator_user_id()`)) {
    fail(`${descriptor.table} patient predicate must compare its bigint ${descriptor.patientColumn} column against app.current_integrator_user_id()`);
  }

  if (createStatement.includes("app.current_patient_user_id()")) {
    fail(`${descriptor.table} bigint patient predicate must NOT reference app.current_patient_user_id()`);
  }
}

const expectedPatientChainOwnedTargets = 7;
const patientChainOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientChain);

if (patientChainOwnedDescriptors.length !== expectedPatientChainOwnedTargets) {
  fail(`Expected ${expectedPatientChainOwnedTargets} P0.8.5 patient-chain-owned targets, got ${patientChainOwnedDescriptors.length}`);
}

const expectedChainTables = [
  ...expectedP085IntegratorIdentityBridgeTargets,
  ...expectedP085IntegratorParentDenormTargets,
].sort();

if (JSON.stringify(patientChainOwnedDescriptors.map((d) => d.table).sort()) !== JSON.stringify(expectedChainTables)) {
  fail(`P0.8.5 patient-chain-owned target set must stay stable: ${patientChainOwnedDescriptors.map((d) => d.table).join(", ")}`);
}

for (const descriptor of patientChainOwnedDescriptors) {
  if (!["P0.4.I2", "P0.4.I3"].includes(descriptor.sourceStage)) {
    fail(`${descriptor.table} chain-owned target must be P0.4.I2 or P0.4.I3, got ${descriptor.sourceStage}`);
  }

  if (descriptor.patientChain.castType !== "bigint") {
    fail(`${descriptor.table} integrator chain must cast to bigint, got ${descriptor.patientChain.castType}`);
  }

  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const createStatement = statements.find(
    (statement) => statement.startsWith(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes("app.is_staff()")) {
    fail(`${descriptor.table} chain-owned policy must include the fail-closed staff-or-patient branch`);
  }

  if (!createStatement.includes("EXISTS (")) {
    fail(`${descriptor.table} chain-owned policy must include an EXISTS chain to its identity-bearing table`);
  }

  if (!createStatement.includes(`"user_id" = app.current_integrator_user_id()`)) {
    fail(`${descriptor.table} chain-owned policy must terminate on a bigint user_id column via app.current_integrator_user_id()`);
  }
}

console.log(
  `P0.8.5 policy generator OK: 13 integrator targets (${expectedP085IntegratorDirectUserBridgeTargets.length} I1, ${expectedP085IntegratorIdentityBridgeTargets.length} I2, ${expectedP085IntegratorParentDenormTargets.length} I3, ${expectedP085IntegratorMailingsRootTargets.length} I4, ${patientOwnedDescriptors.length} patient-owned, ${patientChainOwnedDescriptors.length} patient-chain-owned) with P0.4 source artifacts present.`,
);
