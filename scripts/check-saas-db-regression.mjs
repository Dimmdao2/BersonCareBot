#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const checks = [
  ['SAAS P0.4 batch manifest', 'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-batches.mjs'],
  [
    'SAAS P0.4.BE FK-path manifest',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-be-fk-paths.mjs',
  ],
  [
    'SAAS P0.5 generated role split',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-5-role-split.mjs',
  ],
  [
    'SAAS P0.8.1 RLS descriptor model',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs',
  ],
  [
    'SAAS new public org-table RLS coverage',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-new-table-rls-coverage.mjs',
  ],
  [
    'SAAS new public org-table RLS coverage self-test',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-new-table-rls-coverage.mjs',
    '--self-test',
  ],
  [
    'SAAS P0.8.2 RLS SQL renderer',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs',
  ],
  [
    'SAAS P0.8.3 public policy generator',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs',
  ],
  [
    'SAAS P0.8.4 FK/denorm policy generator',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-4-policy-generator.mjs',
  ],
  [
    'SAAS P0.8.5 integrator policy generator',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-5-policy-generator.mjs',
  ],
  [
    'SAAS P0.8.6 bootstrap policy generator',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-6-policy-generator.mjs',
  ],
  [
    'SAAS P0.8.7 explicit exemptions',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-7-explicit-exemptions.mjs',
  ],
  [
    'SAAS P0.9 enforce descriptors',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-9-enforce-descriptors.mjs',
  ],
  [
    'SAAS P0.10 tier completeness',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs',
  ],
  [
    'SAAS P0.10 user-reference classification',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-user-reference-tier-guard.mjs',
  ],
  [
    'SAAS P0.10 scoped descriptor semantics',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-scoped-tenant-semantics.mjs',
  ],
  [
    'SAAS P0.12 polymorphic classification',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-12-polymorphic-references.mjs',
  ],
  [
    'SAAS P0.12 JSON payload classification',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-12-json-payloads.mjs',
  ],
  [
    'SAAS P0.13 synthetic fixture generator',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-13-synthetic-fixtures.mjs',
  ],
  // #1074 step 1 keeps the dormant-smoke harness but unhooks it until the five removed
  // app-level target tests are rebuilt under the new suite contract.
  [
    'SAAS Phase 4 generated locked-policy artifact',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-locked-policy-artifact.mjs',
  ],
  [
    'SAAS S5-2 generated artifacts and classifications',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs',
  ],
  [
    'SAAS D1 grant metadata',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-d1-664-with-check-reverify.mjs',
  ],
  [
    'SAAS D8 mailing retirement',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-d8-mailing-retirement.mjs',
  ],
  [
    'SAAS D8 mailing retirement self-test',
    'docs/_TODO/SAAS_FOUNDATION/scripts/check-d8-mailing-retirement.mjs',
    '--self-test',
  ],
];

for (const [label, script, ...args] of checks) {
  console.log(`check-saas-db-regression: ${label}`);
  const result = spawnSync('node', [script, ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error(`check-saas-db-regression: failed to start node ${script}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`check-saas-db-regression: FAILED ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('check-saas-db-regression: OK');
