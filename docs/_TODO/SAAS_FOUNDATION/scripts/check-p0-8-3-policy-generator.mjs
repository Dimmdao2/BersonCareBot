#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  expectedP083PublicDirectOrgTargets,
  getP083PublicDirectOrgDescriptors,
  p083PolicyName,
  renderP083PolicyStatements,
} from "./p0-8-3-policy-targets.mjs";
import { renderOrgAndPatientPredicate, renderOrgPredicate, renderStaffActorCheck } from "./rls-sql-renderer.mjs";

// B4-fanout gap closure (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #656) +
// B4-core-3 census follow-up (LOG.md, taskdb #658): chain-owned P0.8.3 direct-org tables — patient
// is reached via an EXISTS to an already-walled parent, not a direct column on the row itself. The
// original gap closure found support_questions; the B4-core-3 exhaustive census found 11 more
// be_appointment_*/be_package_*/be_refunds/be_product_history_events/reminder_journal children of
// already-walled be_appointments/be_patient_packages/be_payments/be_product_purchases/
// reminder_rules — see rls-descriptor-model.mjs `patientChainOwnedTables`.
const expectedPatientChainOwnedTargets = 12;

const parentCopyHolds = new Set([
  "public.content_section_slug_history",
  "public.media_transcode_jobs",
  "public.patient_daily_warmup_video_views",
  "public.reference_items",
]);

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #653): patient-owned
// P0.8.3 direct-org tables render org AND (staff OR patient) instead of a plain org predicate.
// See rls-descriptor-model.mjs `patientOwnedColumns` for the full classification/rationale.
// B4-core-3 (taskdb #658) adds 4 more: media_playback_client_events/media_hls_proxy_error_events/
// media_playback_resolution_events/media_playback_user_video_first_resolve each carry a direct
// `user_id` column referencing platform_users(id), same shape as the already-registered
// patient_daily_warmup_video_views/product_analytics_events_recent.
const expectedPatientOwnedTargets = 48;

const descriptors = getP083PublicDirectOrgDescriptors();
const targets = descriptors.map((descriptor) => descriptor.table);
const statements = renderP083PolicyStatements({ descriptors });
const plainOrgPredicate = renderOrgPredicate(descriptors[0], { mode: "dormant_permissive" });
const patientOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientColumn);
const patientChainOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientChain);

function expectedPredicateFor(descriptor) {
  return descriptor.patientColumn || descriptor.patientChain
    ? renderOrgAndPatientPredicate(descriptor, { mode: "dormant_permissive" })
    : plainOrgPredicate;
}

assert.equal(targets.length, 105, "P0.8.3 must target exactly 105 public direct-org tables");
assert.deepEqual(targets, [...expectedP083PublicDirectOrgTargets].sort(), "P0.8.3 targets must stay stable");
assert.equal(statements.length, targets.length * 4, "Each target must render four DDL statements");

for (const hold of parentCopyHolds) {
  assert.equal(targets.includes(hold), false, `${hold} must remain a P0.8.4 hold`);
}

for (const descriptor of descriptors) {
  assert.equal(descriptor.tier, "SCOPED");
  assert.equal(descriptor.scopingKind, "direct_org_column");
  assert.equal(descriptor.orgColumn, "organization_id");
}

// NOTE: statements are rendered exactly 4-per-descriptor, IN THE SAME ORDER as `descriptors` (see
// renderP083PolicyStatements' flatMap) — slice each descriptor's block by POSITION, not by
// substring-matching the quoted table name. A chain-owned descriptor's CREATE POLICY can legally
// reference ANOTHER target's quoted qualified name inside its EXISTS clause (e.g. support_questions
// chains through "public"."support_conversations"), which would make a substring filter overcount.
descriptors.forEach((descriptor, index) => {
  const target = descriptor.table;
  const escapedTarget = target
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const targetStatements = statements.slice(index * 4, index * 4 + 4);
  const expectedPredicate = expectedPredicateFor(descriptor);

  assert.equal(targetStatements.length, 4, `${target} must have exactly four statements`);
  assert.equal(targetStatements[0], `ALTER TABLE ${escapedTarget} ENABLE ROW LEVEL SECURITY;`);
  assert.equal(targetStatements[1], `ALTER TABLE ${escapedTarget} FORCE ROW LEVEL SECURITY;`);
  assert.equal(targetStatements[2], `DROP POLICY IF EXISTS "${p083PolicyName}" ON ${escapedTarget};`);
  assert.equal(
    targetStatements[3],
    `CREATE POLICY "${p083PolicyName}" ON ${escapedTarget} FOR ALL USING (${expectedPredicate}) WITH CHECK (${expectedPredicate});`,
  );

  if (descriptor.patientColumn || descriptor.patientChain) {
    assert.match(
      targetStatements[3],
      /NULLIF\(current_setting\('app\.actor', true\), ''\) = 'staff'/,
      `${target} patient-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (descriptor.patientChain) {
    assert.match(
      targetStatements[3],
      /EXISTS \(/,
      `${target} chain-owned policy must include an EXISTS chain to its identity-bearing parent`,
    );
  }
});

assert.match(
  statements.join("\n"),
  /NULLIF\(current_setting\('app\.org', true\), ''\) IS NULL OR "organization_id" = NULLIF\(current_setting\('app\.org', true\), ''\)::uuid/,
  "Generated policy must use the dormant permissive org predicate",
);

assert.equal(
  patientOwnedDescriptors.length,
  expectedPatientOwnedTargets,
  `Expected ${expectedPatientOwnedTargets} P0.8.3 patient-owned targets, got ${patientOwnedDescriptors.length}`,
);

assert.equal(
  patientChainOwnedDescriptors.length,
  expectedPatientChainOwnedTargets,
  `Expected ${expectedPatientChainOwnedTargets} P0.8.3 patient-chain-owned targets, got ${patientChainOwnedDescriptors.length}`,
);

assert.deepEqual(
  patientChainOwnedDescriptors.map((descriptor) => descriptor.table),
  [
    "public.be_appointment_cancellations",
    "public.be_appointment_events",
    "public.be_appointment_history_events",
    "public.be_appointment_no_shows",
    "public.be_appointment_reschedules",
    "public.be_booking_form_submissions",
    "public.be_package_history_events",
    "public.be_package_usages",
    "public.be_product_history_events",
    "public.be_refunds",
    "public.reminder_journal",
    "public.support_questions",
  ],
  "P0.8.3 patient-chain-owned target set must stay stable",
);

// Sanity: the staff-bypass check must be present verbatim so staff (org-wide, variant A) is
// never additionally restricted by the patient branch.
assert.equal(renderStaffActorCheck(), "NULLIF(current_setting('app.actor', true), '') = 'staff'");

console.log(
  `P0.8.3 policy generator OK: 105 targets (${patientOwnedDescriptors.length} patient-owned, ${patientChainOwnedDescriptors.length} patient-chain-owned) and deterministic dormant policy DDL.`,
);
