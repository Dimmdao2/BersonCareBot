#!/usr/bin/env node

import {
  buildRlsDescriptors,
  readBatchRows,
  readBeFkPathRows,
  readTierRows,
  scopedKinds,
} from "./rls-descriptor-model.mjs";

const expectedTierCounts = new Map([
  ["BOOTSTRAP", 24],
  ["INFRA", 22],
  ["LEGACY", 16],
  ["SCOPED", 155],
  ["TELEMETRY", 2],
]);

const expectedBootstrapHybridTables = new Set([
  "integrator.system_settings",
  "public.platform_user_contacts",
  "public.system_settings",
  "public.user_phone_history",
]);

const expectedScopedFkPathTables = new Set([
  "public.be_package_items",
  "public.be_patient_package_items",
]);

function fail(message) {
  throw new Error(message);
}

function sameSet(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function setDiff(left, right) {
  return Array.from(left).filter((value) => !right.has(value)).sort();
}

const tierRows = readTierRows();
const descriptors = buildRlsDescriptors();
const tierByTable = new Map();
const duplicates = new Set();

for (const { tier, table } of tierRows) {
  if (tierByTable.has(table)) {
    duplicates.add(table);
  }

  tierByTable.set(table, tier);
}

if (duplicates.size > 0) {
  fail(`Duplicate tier rows: ${Array.from(duplicates).sort().join(", ")}`);
}

if (tierRows.length !== 219) {
  fail(`Expected 219 tier rows, got ${tierRows.length}`);
}

if (descriptors.size !== tierRows.length) {
  fail(`Expected ${tierRows.length} descriptors, got ${descriptors.size}`);
}

const descriptorTables = new Set(descriptors.keys());
const tierTables = new Set(tierByTable.keys());

if (!sameSet(descriptorTables, tierTables)) {
  const missing = setDiff(tierTables, descriptorTables);
  const extra = setDiff(descriptorTables, tierTables);
  fail(`Descriptor table mismatch. Missing: ${missing.join(", ")}. Extra: ${extra.join(", ")}`);
}

const actualTierCounts = new Map();
const actualBootstrapHybridTables = new Set();
const actualScopedFkPathTables = new Set();
const batchTables = new Set(readBatchRows().map((row) => row.table));
const beFkPathTables = new Set(readBeFkPathRows().map((row) => row.table));

for (const [table, descriptor] of descriptors.entries()) {
  const expectedTier = tierByTable.get(table);

  if (descriptor.tier !== expectedTier) {
    fail(`Tier mismatch for ${table}: expected ${expectedTier}, got ${descriptor.tier}`);
  }

  actualTierCounts.set(descriptor.tier, (actualTierCounts.get(descriptor.tier) ?? 0) + 1);

  if (!descriptor.predicateTemplate) {
    fail(`Missing predicate template for ${table}`);
  }

  if (descriptor.tier === "SCOPED") {
    if (!scopedKinds.has(descriptor.scopingKind)) {
      fail(`Invalid SCOPED scoping kind for ${table}: ${descriptor.scopingKind}`);
    }

    if (
      descriptor.scopingKind !== "fk_path" &&
      descriptor.scopingKind !== "self_org_id" &&
      descriptor.orgColumn !== "organization_id"
    ) {
      fail(`SCOPED descriptor ${table} must declare organization_id or an explicit path/self scope`);
    }

    if (descriptor.scopingKind === "fk_path") {
      actualScopedFkPathTables.add(table);

      if (!descriptor.fkPath?.parentTable || !descriptor.fkPath?.crossCheckTable) {
        fail(`FK-path descriptor ${table} is missing parent/cross-check metadata`);
      }
    }

    if (batchTables.has(table) && !descriptor.sourceStage?.startsWith("P0.4.")) {
      fail(`Batch-scoped table ${table} must retain its P0.4 source stage`);
    }

    if (beFkPathTables.has(table) && descriptor.scopingKind !== "fk_path") {
      fail(`P0.4.BE table ${table} must be represented as fk_path`);
    }
  }

  if (descriptor.tier === "BOOTSTRAP") {
    if (descriptor.scopingKind === "bootstrap_hybrid") {
      actualBootstrapHybridTables.add(table);

      if (descriptor.orgColumn !== "organization_id") {
        fail(`BOOTSTRAP hybrid descriptor ${table} must declare organization_id`);
      }
    } else if (descriptor.scopingKind !== "bootstrap_global") {
      fail(`Invalid BOOTSTRAP scoping kind for ${table}: ${descriptor.scopingKind}`);
    }
  }

  if (["INFRA", "LEGACY", "TELEMETRY"].includes(descriptor.tier)) {
    if (descriptor.scopingKind !== "explicit_exemption" || !descriptor.source) {
      fail(`${descriptor.tier} descriptor ${table} must declare an explicit exemption`);
    }
  }
}

for (const [tier, expectedCount] of expectedTierCounts.entries()) {
  const actualCount = actualTierCounts.get(tier) ?? 0;

  if (actualCount !== expectedCount) {
    fail(`Expected ${tier}=${expectedCount}, got ${actualCount}`);
  }
}

if (!sameSet(actualBootstrapHybridTables, expectedBootstrapHybridTables)) {
  fail(
    `Unexpected BOOTSTRAP hybrid set. Missing: ${setDiff(expectedBootstrapHybridTables, actualBootstrapHybridTables).join(", ")}. Extra: ${setDiff(actualBootstrapHybridTables, expectedBootstrapHybridTables).join(", ")}`,
  );
}

if (!sameSet(actualScopedFkPathTables, expectedScopedFkPathTables)) {
  fail(
    `Unexpected SCOPED FK-path set. Missing: ${setDiff(expectedScopedFkPathTables, actualScopedFkPathTables).join(", ")}. Extra: ${setDiff(actualScopedFkPathTables, expectedScopedFkPathTables).join(", ")}`,
  );
}

console.log("P0.8.1 RLS descriptor model OK: 219 descriptors cover tiers-218.tsv exactly once.");
console.log(
  Array.from(actualTierCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tier, count]) => `${tier}=${count}`)
    .join(" "),
);
console.log(
  `SCOPED sources: batch=${batchTables.size}, be_fk_path=${actualScopedFkPathTables.size}, be_direct_or_self=${
    expectedTierCounts.get("SCOPED") - batchTables.size - actualScopedFkPathTables.size
  }`,
);
