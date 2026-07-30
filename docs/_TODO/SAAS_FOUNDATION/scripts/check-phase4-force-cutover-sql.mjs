#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { getPhase4LockedPolicyTargets } from './phase4-locked-policy-artifact.mjs';

const artifactPath = 'deploy/postgres/phase4-force-rls-cutover.sql';
const targetPattern = /\('((?:''|[^'])+)'\)/g;

function quotedTable(table) {
  const [schema, name] = table.split('.');
  return `"${schema}"."${name}"`;
}

const expectedTargets = getPhase4LockedPolicyTargets()
  .map(({ descriptor }) => quotedTable(descriptor.table))
  .sort();
const artifactSource = readFileSync(artifactPath, 'utf8');
const artifactTargets = [...artifactSource.matchAll(targetPattern)].map(
  (match) => match[1].replaceAll("''", "'"),
);
const uniqueArtifactTargets = [...new Set(artifactTargets)].sort();

if (
  uniqueArtifactTargets.length !== artifactTargets.length ||
  JSON.stringify(uniqueArtifactTargets) !== JSON.stringify(expectedTargets)
) {
  const artifactSet = new Set(uniqueArtifactTargets);
  const expectedSet = new Set(expectedTargets);
  const missing = expectedTargets.filter((target) => !artifactSet.has(target));
  const unexpected = uniqueArtifactTargets.filter((target) => !expectedSet.has(target));
  throw new Error(
    `${artifactPath} differs from generated Phase 4 targets: missing=${missing.join(',')}; unexpected=${unexpected.join(',')}`,
  );
}

const pinnedCountMatch = artifactSource.match(
  /IF v_expected_count <> (\d+) THEN[\s\S]*?RAISE EXCEPTION 'phase4_force_target_count_mismatch:[\s\S]*?\n\s*(\d+), v_expected_count;/,
);
if (
  !pinnedCountMatch ||
  Number(pinnedCountMatch[1]) !== expectedTargets.length ||
  Number(pinnedCountMatch[2]) !== expectedTargets.length
) {
  throw new Error(
    `${artifactPath} pinned target count differs from generated Phase 4 targets: expected=${expectedTargets.length}`,
  );
}

console.log(
  `check-phase4-force-cutover-sql: generated target artifact OK (${expectedTargets.length})`,
);
