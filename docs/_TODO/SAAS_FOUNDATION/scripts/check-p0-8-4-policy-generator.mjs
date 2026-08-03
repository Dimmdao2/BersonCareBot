#!/usr/bin/env node

import {
  expectedP084BlockedPolymorphicTargets,
  expectedP084PublicDenormTargets,
  expectedP084PublicFkPathTargets,
  expectedP084PublicPolymorphicTargets,
  getP084PublicPathDescriptors,
  p084PolicyName,
  renderP084PolicyStatements,
} from './p0-8-4-policy-targets.mjs';

function fail(message) {
  throw new Error(message);
}

const descriptors = getP084PublicPathDescriptors();
const statements = renderP084PolicyStatements({ descriptors });
const sql = statements.join('\n');

if (descriptors.length !== 37) {
  fail(`Expected 37 P0.8.4 descriptors, got ${descriptors.length}`);
}

if (expectedP084PublicFkPathTargets.length !== 2) {
  fail(`Expected 2 explicit FK-path targets, got ${expectedP084PublicFkPathTargets.length}`);
}

if (expectedP084PublicDenormTargets.length !== 34) {
  fail(`Expected 34 explicit denorm targets, got ${expectedP084PublicDenormTargets.length}`);
}

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): P0.12.1 is
// complete (docs/_TODO/SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md) — public.comments is no
// longer blocked, it now renders a real (org AND (staff OR polymorphic-patient)) dormant policy.
// The blocked-set mechanism stays available (and must stay EMPTY) for any future, not-yet-resolved
// polymorphic SCOPED target.
if (expectedP084BlockedPolymorphicTargets.length !== 0) {
  fail('P0.8.4 blocked-polymorphic set must be empty now that public.comments is resolved');
}

if (expectedP084PublicPolymorphicTargets.join(',') !== 'public.comments') {
  fail('P0.8.4 must resolve exactly public.comments as its polymorphic target');
}

if (statements.length !== descriptors.length * 3) {
  fail(`Expected ${descriptors.length * 3} dormant policy statements, got ${statements.length}`);
}

if (sql.includes('FORCE ROW LEVEL SECURITY')) {
  fail('P0.8.4 dormant generated SQL must not include FORCE ROW LEVEL SECURITY');
}

for (const descriptor of descriptors) {
  if (!['fk_path', 'denorm_org_column', 'polymorphic_resolver'].includes(descriptor.scopingKind)) {
    fail(`Unexpected P0.8.4 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
  }

  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');

  if (!sql.includes(`ALTER TABLE ${quotedTarget} ENABLE ROW LEVEL SECURITY;`)) {
    fail(`Missing ENABLE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`DROP POLICY IF EXISTS "${p084PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (!sql.includes('"public"."comments"')) {
  fail('P0.8.4 generated SQL must target public.comments now that P0.12.1 is resolved');
}

for (const table of expectedP084PublicFkPathTargets) {
  const descriptor = descriptors.find((candidate) => candidate.table === table);

  if (!descriptor?.fkPath) {
    fail(`FK-path target ${table} is missing fkPath metadata`);
  }

  for (const token of [descriptor.fkPath.parentTable, descriptor.fkPath.crossCheckTable]) {
    const quotedQualified = token
      .split('.')
      .map((part) => `"${part}"`)
      .join('.');

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
//
// Corrected 2026-07-26 (taskdb #1018): public.reminder_occurrence_history moved OUT of this direct
// count (11 -> 10) into the patient-chain-owned count below (15 -> 16). D21 then retired
// public.webapp_reminder_occurrences, reducing this direct count once more. It kept the same
// integrator_user_id/bigint column shape as its sibling public.reminder_delivery_events (still
// counted here), but a direct column predicate reading app.current_integrator_user_id() can never
// admit a patient session — packages/db-principal/src/index.ts applyDbPrincipal always clears that
// GUC for kind "patient". Proven live: all three patient reminder actions (done/snooze/skip) 404'd.
// See rls-descriptor-model.mjs patientOwnedColumns/patientChainOwnedTables for the full note.
const expectedPatientOwnedTargets = 9;
const patientOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientColumn);

if (patientOwnedDescriptors.length !== expectedPatientOwnedTargets) {
  fail(
    `Expected ${expectedPatientOwnedTargets} P0.8.4 patient-owned targets, got ${patientOwnedDescriptors.length}`,
  );
}

// Helper alignment (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md B4-fanout, taskdb #656):
// a bigint-cast patient column (integrator identity bridge, e.g. reminder_delivery_events/
// reminder_occurrence_history.integrator_user_id) must read the DEDICATED integrator helper,
// not the patient UUID helper.
function patientHelperFor(descriptor) {
  return descriptor.patientColumnCastType === 'bigint'
    ? 'app.current_integrator_user_id()'
    : 'app.current_patient_user_id()';
}

for (const descriptor of patientOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} patient-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (descriptor.scopingKind === 'fk_path') {
    if (!createStatement.includes(`"p0_8_4_patient_parent"."${descriptor.patientColumn}"`)) {
      fail(
        `${descriptor.table} fk_path patient predicate must EXISTS-join the parent's patient column`,
      );
    }
  } else if (
    !createStatement.includes(`"${descriptor.patientColumn}" = ${patientHelperFor(descriptor)}`)
  ) {
    fail(
      `${descriptor.table} denorm patient predicate must compare its own ${descriptor.patientColumn} column against ${patientHelperFor(descriptor)}`,
    );
  }
}

// B4-fanout gap closure (taskdb #656): chain-owned P0.8.4 targets — no direct patient column on
// the child row, patient owner reached via an EXISTS chain to an identity-bearing parent
// (support_conversations.platform_user_id for the original 3).
// B4-core-3 (taskdb #658) adds 9 single-hop parent_denorm chain targets whose parent already
// carries a direct patient column (online_intake_requests.user_id, clinical_complaint/
// clinical_diagnosis/test_attempts/treatment_program_instances.patient_user_id,
// lfk_complexes.platform_user_id), plus 3 more found by the exhaustive census: a single-hop
// treatment_program_events -> treatment_program_instances.patient_user_id, and TWO-hop
// treatment_program_instance_stage_items/_groups -> treatment_program_instance_stages (itself
// chain-owned, no direct column) -> treatment_program_instances.patient_user_id.
// Corrected 2026-07-26 (taskdb #1018): +1 (15 -> 16) for public.reminder_occurrence_history, moved in
// from the direct patient-owned count above — bridged through platform_users.integrator_user_id
// (UNIQUE) instead of reading app.current_integrator_user_id() directly, which a patient session
// never populates. See rls-descriptor-model.mjs for the full note.
const expectedPatientChainOwnedTargets = 16;
const patientChainOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientChain);

if (patientChainOwnedDescriptors.length !== expectedPatientChainOwnedTargets) {
  fail(
    `Expected ${expectedPatientChainOwnedTargets} P0.8.4 patient-chain-owned targets, got ${patientChainOwnedDescriptors.length}`,
  );
}

const expectedChainTables = [
  'public.support_conversation_messages',
  'public.support_delivery_events',
  'public.support_question_messages',
  'public.online_intake_answers',
  'public.online_intake_attachments',
  'public.online_intake_status_history',
  'public.clinical_complaint_update',
  'public.clinical_diagnosis_update',
  'public.clinical_diagnosis_status_history',
  'public.test_results',
  'public.treatment_program_instance_stages',
  'public.lfk_complex_exercises',
  'public.treatment_program_events',
  'public.treatment_program_instance_stage_items',
  'public.treatment_program_instance_stage_groups',
  'public.reminder_occurrence_history',
].sort();

if (
  JSON.stringify(patientChainOwnedDescriptors.map((d) => d.table).sort()) !==
  JSON.stringify(expectedChainTables)
) {
  fail(
    `P0.8.4 patient-chain-owned target set must stay stable: ${patientChainOwnedDescriptors.map((d) => d.table).join(', ')}`,
  );
}

for (const descriptor of patientChainOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} chain-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (!createStatement.includes('EXISTS (')) {
    fail(
      `${descriptor.table} chain-owned policy must include an EXISTS chain to its identity-bearing parent`,
    );
  }

  const terminalColumn = descriptor.patientChain.terminalColumn;

  if (!createStatement.includes(`"${terminalColumn}" = app.current_patient_user_id()`)) {
    fail(
      `${descriptor.table} chain-owned policy must terminate on its identity-bearing parent's ${terminalColumn}`,
    );
  }
}

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): public.
// media_transcode_jobs has no owner column of its own — its dual-role ownership is inherited via an
// EXISTS to its media_id parent (public.media_files), same conditional (shared-or-own-submission)
// shape media_files itself gets under P0.8.3 (see check-p0-8-3-policy-generator.mjs).
const expectedPatientConditionalChainOwnedTargets = 1;
const patientConditionalChainOwnedDescriptors = descriptors.filter(
  (descriptor) => descriptor.patientConditionalChain,
);

if (
  patientConditionalChainOwnedDescriptors.length !== expectedPatientConditionalChainOwnedTargets
) {
  fail(
    `Expected ${expectedPatientConditionalChainOwnedTargets} P0.8.4 patient-conditional-chain-owned targets, got ${patientConditionalChainOwnedDescriptors.length}`,
  );
}

if (patientConditionalChainOwnedDescriptors[0]?.table !== 'public.media_transcode_jobs') {
  fail('P0.8.4 patient-conditional-chain-owned target must be public.media_transcode_jobs');
}

for (const descriptor of patientConditionalChainOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} conditional-chain-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (!createStatement.includes(`EXISTS ( SELECT 1 FROM "public"."media_files"`)) {
    fail(
      `${descriptor.table} conditional-chain-owned policy must EXISTS-join its media_files parent`,
    );
  }

  if (!createStatement.includes(`"usage_purpose" IS DISTINCT FROM 'program_item_submission'`)) {
    fail(
      `${descriptor.table} conditional-chain-owned policy must permit the shared/library branch of its parent`,
    );
  }

  if (!createStatement.includes(`"uploaded_by" = app.current_patient_user_id()`)) {
    fail(
      `${descriptor.table} conditional-chain-owned policy must permit the patient's own-submission branch of its parent`,
    );
  }
}

// B4-core-4: public.comments is polymorphic — 5 catalog target_type values stay org-wide (no extra
// check), 4 patient-instance target_type values additionally resolve to their owning patient via a
// chain predicate (same renderPatientChainPredicate shape proven for the direct chain family above).
const expectedPatientPolymorphicOwnedTargets = 1;
const patientPolymorphicOwnedDescriptors = descriptors.filter(
  (descriptor) => descriptor.patientPolymorphic,
);

if (patientPolymorphicOwnedDescriptors.length !== expectedPatientPolymorphicOwnedTargets) {
  fail(
    `Expected ${expectedPatientPolymorphicOwnedTargets} P0.8.4 patient-polymorphic-owned targets, got ${patientPolymorphicOwnedDescriptors.length}`,
  );
}

if (patientPolymorphicOwnedDescriptors[0]?.table !== 'public.comments') {
  fail('P0.8.4 patient-polymorphic-owned target must be public.comments');
}

for (const descriptor of patientPolymorphicOwnedDescriptors) {
  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} polymorphic-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (!createStatement.includes(`"target_type" = ANY (ARRAY[`)) {
    fail(
      `${descriptor.table} polymorphic-owned policy must keep the shared/catalog target_type branch`,
    );
  }

  for (const variant of descriptor.patientPolymorphic.variants) {
    if (!createStatement.includes(`"target_type" = '${variant.typeValue}'`)) {
      fail(
        `${descriptor.table} polymorphic-owned policy must gate the ${variant.typeValue} variant on its target_type`,
      );
    }
  }
}

console.log(
  `P0.8.4 policy generator OK: 37 targets (${expectedP084PublicFkPathTargets.length} FK-path, ${expectedP084PublicDenormTargets.length} denorm, ${expectedP084PublicPolymorphicTargets.length} polymorphic, ${patientOwnedDescriptors.length} patient-owned, ${patientChainOwnedDescriptors.length} patient-chain-owned, ${patientConditionalChainOwnedDescriptors.length} patient-conditional-chain-owned, ${patientPolymorphicOwnedDescriptors.length} patient-polymorphic-owned), public.comments resolved (P0.12.1 complete).`,
);
