#!/usr/bin/env node

import {
  expectedP084BlockedPolymorphicTargets,
  expectedP084PublicDenormTargets,
  expectedP084PublicFkPathTargets,
  getP084PublicPathDescriptors,
  p084PolicyName,
  renderP084PolicyStatements,
} from "./p0-8-4-policy-targets.mjs";

function fail(message) {
  throw new Error(message);
}

const descriptors = getP084PublicPathDescriptors();
const statements = renderP084PolicyStatements({ descriptors });
const sql = statements.join("\n");

if (descriptors.length !== 37) {
  fail(`Expected 37 P0.8.4 descriptors, got ${descriptors.length}`);
}

if (expectedP084PublicFkPathTargets.length !== 2) {
  fail(`Expected 2 explicit FK-path targets, got ${expectedP084PublicFkPathTargets.length}`);
}

if (expectedP084PublicDenormTargets.length !== 35) {
  fail(`Expected 35 explicit denorm targets, got ${expectedP084PublicDenormTargets.length}`);
}

if (expectedP084BlockedPolymorphicTargets.join(",") !== "public.comments") {
  fail("P0.8.4 must keep public.comments blocked behind P0.12.1");
}

if (statements.length !== descriptors.length * 4) {
  fail(`Expected ${descriptors.length * 4} policy statements, got ${statements.length}`);
}

for (const descriptor of descriptors) {
  if (!["fk_path", "denorm_org_column"].includes(descriptor.scopingKind)) {
    fail(`Unexpected P0.8.4 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
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

  if (!sql.includes(`DROP POLICY IF EXISTS "${p084PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (sql.includes('"public"."comments"')) {
  fail("P0.8.4 generated SQL must not target public.comments before P0.12.1");
}

for (const table of expectedP084PublicFkPathTargets) {
  const descriptor = descriptors.find((candidate) => candidate.table === table);

  if (!descriptor?.fkPath) {
    fail(`FK-path target ${table} is missing fkPath metadata`);
  }

  for (const token of [descriptor.fkPath.parentTable, descriptor.fkPath.crossCheckTable]) {
    const quotedQualified = token
      .split(".")
      .map((part) => `"${part}"`)
      .join(".");

    if (!sql.includes(quotedQualified)) {
      fail(`FK-path target ${table} generated SQL is missing quoted table ${quotedQualified}`);
    }
  }

  for (const token of [
    descriptor.fkPath.localFk,
    descriptor.fkPath.parentPk,
    descriptor.fkPath.parentOrgColumn,
    descriptor.fkPath.crossCheckLocalFk,
    descriptor.fkPath.crossCheckPk,
    descriptor.fkPath.crossCheckOrgColumn,
  ]) {
    if (!sql.includes(`"${token}"`)) {
      fail(`FK-path target ${table} generated SQL is missing quoted column ${token}`);
    }
  }
}

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #653): patient-owned
// P0.8.4 targets must render the fail-closed staff-or-patient branch. be_patient_package_items
// (fk_path) resolves its patient owner via an EXISTS against its parent be_patient_packages;
// the rest (denorm_org_column) have a direct patient column on the child row itself.
const expectedPatientOwnedTargets = 11;
const patientOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientColumn);

if (patientOwnedDescriptors.length !== expectedPatientOwnedTargets) {
  fail(`Expected ${expectedPatientOwnedTargets} P0.8.4 patient-owned targets, got ${patientOwnedDescriptors.length}`);
}

// GUC alignment (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md B4-fanout, taskdb #656):
// a bigint-cast patient column (integrator identity bridge, e.g. reminder_delivery_events/
// reminder_occurrence_history.integrator_user_id) must read the DEDICATED `app.integrator_user_id`
// GUC, not `app.patient_user_id` cast to bigint.
function patientGucNameFor(descriptor) {
  return descriptor.patientColumnCastType === "bigint" ? "app.integrator_user_id" : "app.patient_user_id";
}

for (const descriptor of patientOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const createStatement = statements.find(
    (statement) => statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes("NULLIF(current_setting('app.actor', true), '') = 'staff'")) {
    fail(`${descriptor.table} patient-owned policy must include the fail-closed staff-or-patient branch`);
  }

  if (descriptor.scopingKind === "fk_path") {
    if (!createStatement.includes(`"p0_8_4_patient_parent"."${descriptor.patientColumn}"`)) {
      fail(`${descriptor.table} fk_path patient predicate must EXISTS-join the parent's patient column`);
    }
  } else if (!createStatement.includes(`"${descriptor.patientColumn}" = NULLIF(current_setting('${patientGucNameFor(descriptor)}'`)) {
    fail(`${descriptor.table} denorm patient predicate must compare its own ${descriptor.patientColumn} column against ${patientGucNameFor(descriptor)}`);
  }
}

// B4-fanout gap closure (taskdb #656): chain-owned P0.8.4 targets — no direct patient column on
// the child row, patient owner reached via an EXISTS chain to an identity-bearing parent
// (support_conversations.platform_user_id for the original 3).
// B4-core-3 (taskdb #658) adds 9 more single-hop parent_denorm chain targets whose parent already
// carries a direct patient column (online_intake_requests.user_id, clinical_complaint/
// clinical_diagnosis/test_attempts/treatment_program_instances.patient_user_id,
// lfk_complexes.platform_user_id).
const expectedPatientChainOwnedTargets = 12;
const patientChainOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientChain);

if (patientChainOwnedDescriptors.length !== expectedPatientChainOwnedTargets) {
  fail(`Expected ${expectedPatientChainOwnedTargets} P0.8.4 patient-chain-owned targets, got ${patientChainOwnedDescriptors.length}`);
}

const expectedChainTables = [
  "public.support_conversation_messages",
  "public.support_delivery_events",
  "public.support_question_messages",
  "public.online_intake_answers",
  "public.online_intake_attachments",
  "public.online_intake_status_history",
  "public.clinical_complaint_update",
  "public.clinical_diagnosis_update",
  "public.clinical_diagnosis_status_history",
  "public.test_results",
  "public.treatment_program_instance_stages",
  "public.lfk_complex_exercises",
].sort();

if (JSON.stringify(patientChainOwnedDescriptors.map((d) => d.table).sort()) !== JSON.stringify(expectedChainTables)) {
  fail(`P0.8.4 patient-chain-owned target set must stay stable: ${patientChainOwnedDescriptors.map((d) => d.table).join(", ")}`);
}

for (const descriptor of patientChainOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const createStatement = statements.find(
    (statement) => statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes("NULLIF(current_setting('app.actor', true), '') = 'staff'")) {
    fail(`${descriptor.table} chain-owned policy must include the fail-closed staff-or-patient branch`);
  }

  if (!createStatement.includes("EXISTS (")) {
    fail(`${descriptor.table} chain-owned policy must include an EXISTS chain to its identity-bearing parent`);
  }

  const terminalColumn = descriptor.patientChain.terminalColumn;

  if (!createStatement.includes(`"${terminalColumn}" = NULLIF(current_setting('app.patient_user_id'`)) {
    fail(`${descriptor.table} chain-owned policy must terminate on its identity-bearing parent's ${terminalColumn}`);
  }
}

console.log(
  `P0.8.4 policy generator OK: 37 targets (${expectedP084PublicFkPathTargets.length} FK-path, ${expectedP084PublicDenormTargets.length} denorm, ${patientOwnedDescriptors.length} patient-owned, ${patientChainOwnedDescriptors.length} patient-chain-owned), public.comments blocked for P0.12.1.`,
);
