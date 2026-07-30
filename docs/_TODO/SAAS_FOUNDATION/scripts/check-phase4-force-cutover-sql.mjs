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

console.log(
  `check-phase4-force-cutover-sql: generated target artifact OK (${expectedTargets.length})`,
);
