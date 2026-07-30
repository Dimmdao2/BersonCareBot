#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  getPhase4LockedPolicyTargets,
  phase4LockedPolicyArtifactPath,
  renderPhase4LockedPolicyArtifact,
} from './phase4-locked-policy-artifact.mjs';

const artifact = readFileSync(phase4LockedPolicyArtifactPath, 'utf8');
const expectedArtifact = renderPhase4LockedPolicyArtifact();
if (artifact !== expectedArtifact) {
  throw new Error(
    `${phase4LockedPolicyArtifactPath} is stale; regenerate it from phase4-locked-policy-artifact.mjs`,
  );
}

const targets = getPhase4LockedPolicyTargets();
const policyKeys = targets.map(({ descriptor, policyName }) => `${descriptor.table}:${policyName}`);
const tables = targets.map(({ descriptor }) => descriptor.table);
if (new Set(policyKeys).size !== policyKeys.length || new Set(tables).size !== tables.length) {
  throw new Error('Phase 4 locked policy generator returned duplicate targets');
}

const directoryTarget = targets.find(
  ({ descriptor }) => descriptor.table === 'public.clinic_public_directory_entries',
);
if (!directoryTarget || directoryTarget.descriptor.dormantMode !== 'strict') {
  throw new Error('clinic_public_directory_entries must retain strict dormant classification');
}

console.log('check-phase4-locked-policy-artifact: generated artifact OK');
