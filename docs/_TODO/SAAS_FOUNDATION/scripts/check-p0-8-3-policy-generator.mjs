#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  expectedP083PublicDirectOrgTargets,
  getP083PublicDirectOrgDescriptors,
  p083PolicyName,
  renderP083PolicyStatements,
} from "./p0-8-3-policy-targets.mjs";
import { renderOrgPredicate } from "./rls-sql-renderer.mjs";

const parentCopyHolds = new Set([
  "public.content_section_slug_history",
  "public.media_transcode_jobs",
  "public.patient_daily_warmup_video_views",
  "public.reference_items",
]);

const descriptors = getP083PublicDirectOrgDescriptors();
const targets = descriptors.map((descriptor) => descriptor.table);
const statements = renderP083PolicyStatements({ descriptors });
const expectedPredicate = renderOrgPredicate(descriptors[0], { mode: "dormant_permissive" });

assert.equal(targets.length, 103, "P0.8.3 must target exactly 103 public direct-org tables");
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

for (const target of targets) {
  const escapedTarget = target
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
  const targetStatements = statements.filter((statement) => statement.includes(escapedTarget));

  assert.equal(targetStatements.length, 4, `${target} must have exactly four statements`);
  assert.equal(targetStatements[0], `ALTER TABLE ${escapedTarget} ENABLE ROW LEVEL SECURITY;`);
  assert.equal(targetStatements[1], `ALTER TABLE ${escapedTarget} FORCE ROW LEVEL SECURITY;`);
  assert.equal(targetStatements[2], `DROP POLICY IF EXISTS "${p083PolicyName}" ON ${escapedTarget};`);
  assert.equal(
    targetStatements[3],
    `CREATE POLICY "${p083PolicyName}" ON ${escapedTarget} FOR ALL USING (${expectedPredicate}) WITH CHECK (${expectedPredicate});`,
  );
}

assert.match(
  statements.join("\n"),
  /NULLIF\(current_setting\('app\.org', true\), ''\) IS NULL OR "organization_id" = NULLIF\(current_setting\('app\.org', true\), ''\)::uuid/,
  "Generated policy must use the dormant permissive org predicate",
);

console.log("P0.8.3 policy generator OK: 103 targets and deterministic dormant policy DDL.");
