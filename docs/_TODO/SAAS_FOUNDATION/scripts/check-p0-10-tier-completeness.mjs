#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { readBeFkPathRows, readTierRows } from "./rls-descriptor-model.mjs";

const root = "docs/_TODO/SAAS_FOUNDATION/scope-derivation";

const paths = {
  snapshot: `${root}/all-218-signals.tsv`,
  needsOrg: `${root}/needs-orgid-FINAL.txt`,
  batches: `${root}/p0-4-batches.tsv`,
};

const expectedTierCounts = Object.freeze({
  BOOTSTRAP: 24,
  INFRA: 22,
  LEGACY: 16,
  SCOPED: 155,
  TELEMETRY: 2,
});

function fail(message) {
  throw new Error(message);
}

function readLines(path) {
  return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean);
}

function setDiff(left, right) {
  return Array.from(left).filter((value) => !right.has(value)).sort();
}

function assertSameSet({ actual, expected, label }) {
  const missing = setDiff(expected, actual);
  const extra = setDiff(actual, expected);

  if (missing.length > 0 || extra.length > 0) {
    fail(`${label} mismatch. Missing: ${missing.join(", ") || "<none>"}. Extra: ${extra.join(", ") || "<none>"}`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  if (duplicates.size > 0) {
    fail(`${label} contains duplicates: ${Array.from(duplicates).sort().join(", ")}`);
  }
}

function splitSignalRow(line) {
  const fields = line.includes("\t") ? line.split("\t") : line.split("\\t");

  if (fields.length !== 4) {
    fail(`Unexpected schema snapshot row: ${line}`);
  }

  return fields;
}

function readSchemaSnapshotTables() {
  return readLines(paths.snapshot).map((line) => {
    const [schemaName, tableName] = splitSignalRow(line);

    if (!schemaName || !tableName) {
      fail(`Schema snapshot row is missing schema/table: ${line}`);
    }

    return `${schemaName}.${tableName}`;
  });
}

function readNeedsOrgTables() {
  return readLines(paths.needsOrg);
}

function readBatchTables() {
  const lines = readLines(paths.batches);
  const header = lines.shift();

  if (header !== "batch\ttable\torg_resolution\timplementation_note") {
    fail(`Unexpected header in ${paths.batches}: ${header}`);
  }

  return lines.map((line) => {
    const fields = line.split("\t");

    if (fields.length !== 4 || !fields[1]) {
      fail(`Unexpected P0.4 batch row: ${line}`);
    }

    return fields[1];
  });
}

function buildP0101Facts() {
  const tierRows = readTierRows();
  const tierTables = tierRows.map(({ table }) => table);
  const tierTableSet = new Set(tierTables);
  const snapshotTables = readSchemaSnapshotTables();
  const snapshotTableSet = new Set(snapshotTables);
  const needsOrgTables = readNeedsOrgTables();
  const needsOrgSet = new Set(needsOrgTables);
  const batchTables = readBatchTables();
  const batchTableSet = new Set(batchTables);
  const beFkPathTables = readBeFkPathRows().map((row) => row.table);
  const beFkPathSet = new Set(beFkPathTables);
  const tierCounts = new Map();
  const scopedTables = [];

  for (const { tier, table } of tierRows) {
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);

    if (tier === "SCOPED") {
      scopedTables.push(table);
    }
  }

  const scopedTableSet = new Set(scopedTables);
  const scopedBeTables = scopedTables.filter((table) => table.startsWith("public.be_"));
  const scopedNeedingOrgMaterialization = scopedTables.filter((table) => !table.startsWith("public.be_"));

  return {
    tierRows,
    tierTables,
    tierTableSet,
    snapshotTables,
    snapshotTableSet,
    needsOrgTables,
    needsOrgSet,
    batchTables,
    batchTableSet,
    beFkPathTables,
    beFkPathSet,
    tierCounts,
    scopedTables,
    scopedTableSet,
    scopedBeTables,
    scopedNeedingOrgMaterialization,
  };
}

function runP0101Invariant({
  tierRows,
  tierTables,
  tierTableSet,
  snapshotTables,
  snapshotTableSet,
  needsOrgTables,
  needsOrgSet,
  batchTables,
  batchTableSet,
  beFkPathTables,
  beFkPathSet,
  tierCounts,
  scopedTables,
  scopedTableSet,
  scopedBeTables,
  scopedNeedingOrgMaterialization,
}) {
  assertUnique(tierTables, "tiers-218.tsv");
  assertUnique(snapshotTables, "all-218-signals.tsv");
  assertUnique(needsOrgTables, "needs-orgid-FINAL.txt");
  assertUnique(batchTables, "p0-4-batches.tsv");
  assertUnique(beFkPathTables, "p0-4-be-fk-paths.tsv");

  if (tierRows.length !== 219) {
    fail(`Expected 219 tier rows, got ${tierRows.length}`);
  }

  if (snapshotTables.length !== 219) {
    fail(`Expected 219 schema snapshot rows, got ${snapshotTables.length}`);
  }

  assertSameSet({
    actual: tierTableSet,
    expected: snapshotTableSet,
    label: "tiers-218.tsv vs all-218-signals.tsv",
  });

  for (const [tier, expectedCount] of Object.entries(expectedTierCounts)) {
    const actualCount = tierCounts.get(tier) ?? 0;

    if (actualCount !== expectedCount) {
      fail(`Expected ${tier}=${expectedCount}, got ${actualCount}`);
    }
  }

  const unexpectedTiers = Array.from(tierCounts.keys()).filter((tier) => expectedTierCounts[tier] == null).sort();

  if (unexpectedTiers.length > 0) {
    fail(`Unexpected tier(s): ${unexpectedTiers.join(", ")}`);
  }

  if (scopedTables.length !== 155) {
    fail(`Expected 155 SCOPED tables, got ${scopedTables.length}`);
  }

  if (scopedBeTables.length !== 44) {
    fail(`Expected 44 already-org-scoped public.be_* tables, got ${scopedBeTables.length}`);
  }

  if (scopedNeedingOrgMaterialization.length !== 111) {
    fail(`Expected 111 SCOPED non-be tables needing organization_id materialization, got ${scopedNeedingOrgMaterialization.length}`);
  }

  assertSameSet({
    actual: needsOrgSet,
    expected: new Set(scopedNeedingOrgMaterialization),
    label: "needs-orgid-FINAL.txt vs SCOPED non-be tables",
  });

  assertSameSet({
    actual: batchTableSet,
    expected: needsOrgSet,
    label: "p0-4-batches.tsv vs needs-orgid-FINAL.txt",
  });

  const beFkPathInNeedsOrg = beFkPathTables.filter((table) => needsOrgSet.has(table));

  if (beFkPathInNeedsOrg.length > 0) {
    fail(`P0.4.BE FK-path tables must stay outside needs-orgid-FINAL.txt: ${beFkPathInNeedsOrg.join(", ")}`);
  }

  const beFkPathNotScoped = beFkPathTables.filter((table) => !scopedTableSet.has(table));

  if (beFkPathNotScoped.length > 0) {
    fail(`P0.4.BE FK-path tables must stay SCOPED: ${beFkPathNotScoped.join(", ")}`);
  }

  if (beFkPathSet.size !== 2) {
    fail(`Expected 2 P0.4.BE FK-path tables, got ${beFkPathSet.size}`);
  }
}

function cloneFacts(facts) {
  const cloneSet = (set) => new Set(set);
  const cloneMap = (map) => new Map(map);

  return {
    ...facts,
    tierRows: facts.tierRows.map((row) => ({ ...row })),
    tierTables: [...facts.tierTables],
    tierTableSet: cloneSet(facts.tierTableSet),
    snapshotTables: [...facts.snapshotTables],
    snapshotTableSet: cloneSet(facts.snapshotTableSet),
    needsOrgTables: [...facts.needsOrgTables],
    needsOrgSet: cloneSet(facts.needsOrgSet),
    batchTables: [...facts.batchTables],
    batchTableSet: cloneSet(facts.batchTableSet),
    beFkPathTables: [...facts.beFkPathTables],
    beFkPathSet: cloneSet(facts.beFkPathSet),
    tierCounts: cloneMap(facts.tierCounts),
    scopedTables: [...facts.scopedTables],
    scopedTableSet: cloneSet(facts.scopedTableSet),
    scopedBeTables: [...facts.scopedBeTables],
    scopedNeedingOrgMaterialization: [...facts.scopedNeedingOrgMaterialization],
  };
}

function expectFailure(label, mutate, pattern) {
  const facts = cloneFacts(buildP0101Facts());
  mutate(facts);

  try {
    runP0101Invariant(facts);
  } catch (error) {
    if (!pattern.test(error.message)) {
      fail(`P0.10.1 self-test ${label} failed with unexpected message: ${error.message}`);
    }

    return;
  }

  fail(`P0.10.1 self-test ${label} unexpectedly passed`);
}

function runSelfTest() {
  expectFailure(
    "duplicate tier row",
    (facts) => {
      facts.tierTables.push(facts.tierTables[0]);
    },
    /duplicates/,
  );

  expectFailure(
    "snapshot mismatch",
    (facts) => {
      facts.snapshotTableSet.delete(facts.snapshotTables[0]);
      facts.snapshotTableSet.add("public.synthetic_missing_from_tiers");
    },
    /tiers-218\.tsv vs all-218-signals\.tsv mismatch/,
  );

  expectFailure(
    "needs-org mismatch",
    (facts) => {
      facts.needsOrgSet.delete(facts.scopedNeedingOrgMaterialization[0]);
    },
    /needs-orgid-FINAL\.txt vs SCOPED non-be tables mismatch/,
  );

  expectFailure(
    "fk path in needs-org",
    (facts) => {
      facts.needsOrgSet.add(facts.beFkPathTables[0]);
      facts.needsOrgTables.push(facts.beFkPathTables[0]);
    },
    /needs-orgid-FINAL\.txt vs SCOPED non-be tables mismatch|P0\.4\.BE FK-path tables must stay outside/,
  );

  console.log("P0.10.1 tier completeness self-test OK.");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const facts = buildP0101Facts();
  runP0101Invariant(facts);

  console.log(
    [
      "P0.10.1 tier completeness invariant OK:",
      "219 tier rows match schema snapshot exactly once;",
      "needs-orgid-FINAL=111 SCOPED non-be tables;",
      "P0.4 batches cover needs-org exactly;",
      "P0.4.BE FK-path tables stay outside needs-org.",
    ].join(" "),
  );
}
