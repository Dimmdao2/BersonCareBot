#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { readActualBaseTables } from './actual-schema-tables.mjs';
import { postPhase4StrictPolicyExceptions } from './post-phase4-strict-policy-exceptions.mjs';
import {
  preScopedDirectOrgTables,
  readBeFkPathRows,
  readTierRows,
} from './rls-descriptor-model.mjs';

const root = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation';

const paths = {
  needsOrg: `${root}/needs-orgid-FINAL.txt`,
  batches: `${root}/p0-4-batches.tsv`,
};

function fail(message) {
  throw new Error(message);
}

function readLines(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean);
}

function setDiff(left, right) {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
}

function assertSameSet({ actual, expected, label }) {
  const missing = setDiff(expected, actual);
  const extra = setDiff(actual, expected);

  if (missing.length > 0 || extra.length > 0) {
    fail(
      `${label} mismatch. Missing: ${missing.join(', ') || '<none>'}. Extra: ${extra.join(', ') || '<none>'}`,
    );
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
    fail(`${label} contains duplicates: ${Array.from(duplicates).sort().join(', ')}`);
  }
}

// The P0.10.1 grounding check: tiers-218.tsv is the historical Phase 0 set
// and must exactly match the actual schema after subtracting reviewed
// post-Phase-4 strict-policy exceptions. Reports both directions precisely:
//   - IN CODE, NO TIER: a real table with no tier assignment yet.
//   - IN TSV, NO CODE: a tier row for a table that no longer exists
//     (renamed/dropped) or never did (typo/stale entry).
function assertGroundedInActualSchema({ tierTableSet, actualTableSet }) {
  const inCodeNoTier = setDiff(actualTableSet, tierTableSet);
  const inTsvNoCode = setDiff(tierTableSet, actualTableSet);

  if (inCodeNoTier.length > 0 || inTsvNoCode.length > 0) {
    fail(
      [
        'tiers-218.tsv is not grounded in the actual schema (code + migrations).',
        `IN CODE, NO TIER (${inCodeNoTier.length}): ${inCodeNoTier.join(', ') || '<none>'}.`,
        `IN TSV, NO CODE (${inTsvNoCode.length}): ${inTsvNoCode.join(', ') || '<none>'}.`,
      ].join(' '),
    );
  }
}

function assertPostPhase4StrictPolicyExceptions({
  tierTableSet,
  actualTableSet,
  exceptionTableSet,
}) {
  const missingFromSchema = setDiff(exceptionTableSet, actualTableSet);
  const overlappingTierRows = Array.from(exceptionTableSet)
    .filter((table) => tierTableSet.has(table))
    .sort();

  if (missingFromSchema.length > 0) {
    fail(
      `Post-Phase-4 strict-policy exception is missing from actual schema: ${missingFromSchema.join(', ')}`,
    );
  }
  if (overlappingTierRows.length > 0) {
    fail(
      `Post-Phase-4 strict-policy exceptions must not overlap historical tier rows: ${overlappingTierRows.join(', ')}`,
    );
  }
}

function readNeedsOrgTables() {
  return readLines(paths.needsOrg);
}

function readBatchTables() {
  const lines = readLines(paths.batches);
  const header = lines.shift();

  if (header !== 'batch\ttable\torg_resolution\timplementation_note') {
    fail(`Unexpected header in ${paths.batches}: ${header}`);
  }

  return lines.map((line) => {
    const fields = line.split('\t');

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
  const actualTables = readActualBaseTables();
  const actualTableSet = new Set(actualTables);
  const postPhase4StrictPolicyExceptionSet = new Set(postPhase4StrictPolicyExceptions.keys());
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

    if (tier === 'SCOPED') {
      scopedTables.push(table);
    }
  }

  const scopedTableSet = new Set(scopedTables);
  const scopedBeTables = scopedTables.filter((table) => table.startsWith('public.be_'));
  const scopedNeedingOrgMaterialization = scopedTables.filter(
    (table) => !table.startsWith('public.be_') && !preScopedDirectOrgTables.has(table),
  );

  return {
    tierRows,
    tierTables,
    tierTableSet,
    actualTables,
    actualTableSet,
    postPhase4StrictPolicyExceptionSet,
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
  tierTables,
  tierTableSet,
  actualTableSet,
  postPhase4StrictPolicyExceptionSet,
  needsOrgTables,
  needsOrgSet,
  batchTables,
  batchTableSet,
  beFkPathTables,
  beFkPathSet,
  tierCounts,
  scopedTableSet,
  scopedNeedingOrgMaterialization,
}) {
  assertUnique(tierTables, 'tiers-218.tsv');
  assertUnique(needsOrgTables, 'needs-orgid-FINAL.txt');
  assertUnique(batchTables, 'p0-4-batches.tsv');
  assertUnique(beFkPathTables, 'p0-4-be-fk-paths.tsv');

  assertPostPhase4StrictPolicyExceptions({
    tierTableSet,
    actualTableSet,
    exceptionTableSet: postPhase4StrictPolicyExceptionSet,
  });
  const historicalActualTableSet = new Set(
    Array.from(actualTableSet).filter((table) => !postPhase4StrictPolicyExceptionSet.has(table)),
  );
  assertGroundedInActualSchema({ tierTableSet, actualTableSet: historicalActualTableSet });

  // Зашитые числа по классам убраны 29.07 (решение владельца: «сноси машинерию, оставляй пользу»).
  // Они требовали ручной правки в пяти файлах при каждом изменении схемы и обучали править ожидание,
  // чтобы стало зелено. Полезное — ниже: класс обязан быть известным, а состав классов обязан
  // совпадать с ФАКТИЧЕСКОЙ схемой (assertGroundedInActualSchema выше).
  const knownTiers = new Set(['BOOTSTRAP', 'INFRA', 'LEGACY', 'SCOPED', 'TELEMETRY']);
  const unexpectedTiers = Array.from(tierCounts.keys())
    .filter((tier) => !knownTiers.has(tier))
    .sort();

  if (unexpectedTiers.length > 0) {
    fail(`Unexpected tier(s): ${unexpectedTiers.join(', ')}`);
  }

  assertSameSet({
    actual: needsOrgSet,
    expected: new Set(scopedNeedingOrgMaterialization),
    label: 'needs-orgid-FINAL.txt vs SCOPED non-be tables',
  });

  assertSameSet({
    actual: batchTableSet,
    expected: needsOrgSet,
    label: 'p0-4-batches.tsv vs needs-orgid-FINAL.txt',
  });

  const beFkPathInNeedsOrg = beFkPathTables.filter((table) => needsOrgSet.has(table));

  if (beFkPathInNeedsOrg.length > 0) {
    fail(
      `P0.4.BE FK-path tables must stay outside needs-orgid-FINAL.txt: ${beFkPathInNeedsOrg.join(', ')}`,
    );
  }

  const beFkPathNotScoped = beFkPathTables.filter((table) => !scopedTableSet.has(table));

  if (beFkPathNotScoped.length > 0) {
    fail(`P0.4.BE FK-path tables must stay SCOPED: ${beFkPathNotScoped.join(', ')}`);
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
    actualTables: [...facts.actualTables],
    actualTableSet: cloneSet(facts.actualTableSet),
    postPhase4StrictPolicyExceptionSet: cloneSet(facts.postPhase4StrictPolicyExceptionSet),
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

// A synthetic baseline where the "actual schema" is forced to exactly
// match tiers-218.tsv. Used to isolate self-tests for OTHER invariants
// (needs-org, P0.4.BE FK-paths, ...) from the real, currently-known
// grounding drift (see "real schema is not fully tiered yet" below) so
// each self-test proves exactly one failure mode.
function groundedFacts() {
  const facts = cloneFacts(buildP0101Facts());
  facts.actualTables = [...facts.tierTables, ...facts.postPhase4StrictPolicyExceptionSet];
  facts.actualTableSet = new Set(facts.actualTables);
  return facts;
}

function expectFailure(label, facts, mutate, pattern) {
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
    'duplicate tier row',
    groundedFacts(),
    (facts) => {
      facts.tierTables.push(facts.tierTables[0]);
    },
    /duplicates/,
  );

  expectFailure(
    'actual-schema mismatch',
    groundedFacts(),
    (facts) => {
      facts.actualTableSet.delete(facts.actualTables[0]);
      facts.actualTableSet.add('public.synthetic_missing_from_tiers');
    },
    /not grounded in the actual schema.*IN CODE, NO TIER.*public\.synthetic_missing_from_tiers.*IN TSV, NO CODE/s,
  );

  expectFailure(
    'needs-org mismatch',
    groundedFacts(),
    (facts) => {
      facts.needsOrgSet.delete(facts.scopedNeedingOrgMaterialization[0]);
    },
    /needs-orgid-FINAL\.txt vs SCOPED non-be tables mismatch/,
  );

  expectFailure(
    'fk path in needs-org',
    groundedFacts(),
    (facts) => {
      facts.needsOrgSet.add(facts.beFkPathTables[0]);
      facts.needsOrgTables.push(facts.beFkPathTables[0]);
    },
    /needs-orgid-FINAL\.txt vs SCOPED non-be tables mismatch|P0\.4\.BE FK-path tables must stay outside/,
  );

  // Prove the historical grounding still fails closed against a real tier row;
  // post-Phase-4 strict-policy exceptions stay independently validated above.
  expectFailure(
    'real schema drift is caught (tier row removed)',
    cloneFacts(buildP0101Facts()),
    (facts) => {
      const [droppedTable] = facts.tierTables;
      facts.tierTableSet.delete(droppedTable);
    },
    /not grounded in the actual schema.*IN CODE, NO TIER/s,
  );

  console.log('P0.10.1 tier completeness self-test OK.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const facts = buildP0101Facts();
  runP0101Invariant(facts);

  console.log(
    [
      'P0.10.1 tier completeness invariant OK:',
      'historical tiers-218.tsv rows plus reviewed post-Phase-4 strict-policy exceptions match the actual schema;',
      'needs-orgid-FINAL and P0.4 batches match;',
      'P0.4 batches cover needs-org exactly;',
      'P0.4.BE FK-path tables stay outside needs-org.',
    ].join(' '),
  );
}
