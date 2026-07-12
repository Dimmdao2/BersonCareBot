#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getP083PublicDirectOrgDescriptors, p083PolicyName } from "./p0-8-3-policy-targets.mjs";
import { getP084PublicPathDescriptors, p084PolicyName } from "./p0-8-4-policy-targets.mjs";
import { getP085IntegratorScopedDescriptors, p085PolicyName } from "./p0-8-5-policy-targets.mjs";
import { getP086BootstrapHybridDescriptors, p086PolicyName } from "./p0-8-6-policy-targets.mjs";
import {
  hasAnyPatientOwnership,
  renderBootstrapHybridPredicate,
  renderCreatePolicy,
  renderDropPolicy,
  renderEnableRowLevelSecurity,
  renderFkPathPatientPredicate,
  renderFkPathPredicate,
  renderOrgPredicate,
  renderStaffActorCheck,
  renderStaffOrPatientPredicateForDescriptor,
} from "./rls-sql-renderer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

export const phase4LockedPolicyArtifactPath = "deploy/postgres/phase4-locked-helper-rls-policies.sql";

export const dormantCompatibilityPredicate = [
  "app.current_org_id() IS NULL",
  "app.current_patient_user_id() IS NULL",
  "app.current_integrator_user_id() IS NULL",
  "NOT app.is_staff()",
].join(" AND ");

function compareTable(left, right) {
  return left.descriptor.table.localeCompare(right.descriptor.table);
}

export function getPhase4LockedPolicyTargets() {
  const targets = [
    ...getP083PublicDirectOrgDescriptors().map((descriptor) => ({ descriptor, policyName: p083PolicyName })),
    ...getP084PublicPathDescriptors().map((descriptor) => ({ descriptor, policyName: p084PolicyName })),
    ...getP085IntegratorScopedDescriptors().map((descriptor) => ({ descriptor, policyName: p085PolicyName })),
    ...getP086BootstrapHybridDescriptors().map((descriptor) => ({ descriptor, policyName: p086PolicyName })),
  ].sort(compareTable);

  const keys = targets.map(({ descriptor, policyName }) => `${descriptor.table}\t${policyName}`);
  const uniqueKeys = new Set(keys);
  const uniqueTables = new Set(targets.map(({ descriptor }) => descriptor.table));

  if (targets.length !== 161 || uniqueKeys.size !== targets.length || uniqueTables.size !== targets.length) {
    throw new Error(
      `Expected 161 unique phase4 locked policy targets, got targets=${targets.length}, uniquePolicyPairs=${uniqueKeys.size}, uniqueTables=${uniqueTables.size}`,
    );
  }

  return targets;
}

export function renderPhase4StrictPredicate(descriptor) {
  if (descriptor.scopingKind === "bootstrap_hybrid") {
    return renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });
  }

  const orgPredicate =
    descriptor.scopingKind === "fk_path"
      ? renderFkPathPredicate(descriptor, { mode: "enforce" })
      : renderOrgPredicate(descriptor, { mode: "enforce" });

  if (!hasAnyPatientOwnership(descriptor)) {
    return orgPredicate;
  }

  if (descriptor.scopingKind === "fk_path") {
    return `(${orgPredicate} AND (${renderStaffActorCheck()} OR ${renderFkPathPatientPredicate(descriptor)}))`;
  }

  return `(${orgPredicate} AND ${renderStaffOrPatientPredicateForDescriptor(descriptor, { patientMode: "enforce" })})`;
}

export function renderPhase4DormantCompatPredicate(descriptor) {
  const strictPredicate = renderPhase4StrictPredicate(descriptor);

  if (descriptor.scopingKind === "bootstrap_hybrid") {
    return strictPredicate;
  }

  return `((${dormantCompatibilityPredicate}) OR ${strictPredicate})`;
}

function renderPolicyReplacement({ descriptor, policyName }) {
  const target = descriptor.table;
  const strictPredicate = renderPhase4StrictPredicate(descriptor);
  const dormantCompatPredicate = renderPhase4DormantCompatPredicate(descriptor);

  return [
    `-- ${target} (${policyName})`,
    renderEnableRowLevelSecurity(target),
    renderDropPolicy({ policyName, target }),
    "\\if :phase4_enforce_locked_context",
    renderCreatePolicy({ policyName, target, predicate: strictPredicate }),
    "\\else",
    renderCreatePolicy({ policyName, target, predicate: dormantCompatPredicate }),
    "\\endif",
  ].join("\n");
}

export function renderPhase4LockedPolicyArtifact({ targets = getPhase4LockedPolicyTargets() } = {}) {
  const body = targets.map(renderPolicyReplacement).join("\n\n");

  return `${[
    "-- Phase 4 locked-helper RLS policy replacement.",
    "--",
    "-- Default mode is dormant-compatible: existing non-context legacy sessions keep working, but",
    "-- predicates no longer trust raw app.org/app.patient_user_id/app.integrator_user_id GUCs.",
    "--",
    "-- Cutover mode:",
    "--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -v phase4_enforce_locked_context=1 \\",
    "--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql",
    "--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/phase4-force-rls-cutover.sql",
    "--",
    "-- Dormant compatibility mode (default, no flip):",
    "--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 \\",
    "--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql",
    "--",
    "-- Requires deploy/postgres/p2-b-protected-principal-context.sql first. This artifact intentionally",
    "-- contains no environment references or database names.",
    "",
    "\\set ON_ERROR_STOP on",
    "",
    "\\if :{?phase4_enforce_locked_context}",
    "\\else",
    "\\set phase4_enforce_locked_context 0",
    "\\endif",
    "",
    "SELECT 1 / (:'phase4_enforce_locked_context' IN ('0', '1'))::int AS phase4_enforce_locked_context_is_valid;",
    "",
    "BEGIN;",
    "",
    body,
    "",
    "COMMIT;",
    "",
  ].join("\n")}`;
}

function printSummary() {
  const targets = getPhase4LockedPolicyTargets();
  const byPolicy = new Map();

  for (const { policyName } of targets) {
    byPolicy.set(policyName, (byPolicy.get(policyName) ?? 0) + 1);
  }

  console.log(`phase4 locked policy targets: ${targets.length}`);
  for (const [policyName, count] of [...byPolicy.entries()].sort()) {
    console.log(`${policyName}: ${count}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "--stdout";
  const artifact = renderPhase4LockedPolicyArtifact();

  if (command === "--stdout") {
    process.stdout.write(artifact);
  } else if (command === "--write") {
    const targetPath = path.join(repoRoot, phase4LockedPolicyArtifactPath);
    writeFileSync(targetPath, artifact);
    console.log(`wrote ${phase4LockedPolicyArtifactPath}`);
  } else if (command === "--summary") {
    printSummary();
  } else {
    throw new Error(`Unsupported command ${command}. Use --stdout, --write, or --summary.`);
  }
}
