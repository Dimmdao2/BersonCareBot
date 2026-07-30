#!/usr/bin/env node

import {
  buildRlsDescriptors,
  readBatchRows,
  readBeFkPathRows,
  readTierRows,
  scopedKinds,
} from './rls-descriptor-model.mjs';

const expectedTierCounts = new Map([
  ['BOOTSTRAP', 34],
  ['INFRA', 27],
  ['LEGACY', 9],
  ['SCOPED', 162],
  ['TELEMETRY', 5],
]);

const expectedBootstrapHybridTables = new Set([
  'public.system_settings',
  'public.system_settings_audit',
]);

const expectedBootstrapHybridOrgGatedTables = new Set([
  'public.platform_user_contacts',
  'public.user_phone_history',
]);

const expectedBootstrapRuntimeAudienceTables = new Set(['public.app_runtime_settings']);

const expectedBootstrapRuntimeAuditTables = new Set(['public.app_runtime_settings_audit']);

const expectedScopedFkPathTables = new Set([
  'public.be_package_items',
  'public.be_patient_package_items',
]);

const expectedPublicDirectOrgPolicyTargets = 110;

const expectedP083ParentCopyHolds = new Set([
  'public.content_section_slug_history',
  'public.media_transcode_jobs',
  'public.patient_daily_warmup_video_views',
  'public.reference_items',
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
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
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
  fail(`Duplicate tier rows: ${Array.from(duplicates).sort().join(', ')}`);
}

if (tierRows.length !== 237) {
  fail(`Expected 237 tier rows, got ${tierRows.length}`);
}

if (descriptors.size !== tierRows.length) {
  fail(`Expected ${tierRows.length} descriptors, got ${descriptors.size}`);
}

const descriptorTables = new Set(descriptors.keys());
const tierTables = new Set(tierByTable.keys());

if (!sameSet(descriptorTables, tierTables)) {
  const missing = setDiff(tierTables, descriptorTables);
  const extra = setDiff(descriptorTables, tierTables);
  fail(`Descriptor table mismatch. Missing: ${missing.join(', ')}. Extra: ${extra.join(', ')}`);
}

const actualTierCounts = new Map();
const actualBootstrapHybridTables = new Set();
const actualBootstrapHybridOrgGatedTables = new Set();
const actualBootstrapRuntimeAudienceTables = new Set();
const actualBootstrapRuntimeAuditTables = new Set();
const actualScopedFkPathTables = new Set();
const actualP083ParentCopyHolds = new Set();
let publicDirectOrgPolicyTargetCount = 0;
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

  if (descriptor.tier === 'SCOPED') {
    if (!scopedKinds.has(descriptor.scopingKind)) {
      fail(`Invalid SCOPED scoping kind for ${table}: ${descriptor.scopingKind}`);
    }

    if (
      descriptor.scopingKind !== 'fk_path' &&
      descriptor.scopingKind !== 'self_org_id' &&
      descriptor.orgColumn !== 'organization_id'
    ) {
      fail(
        `SCOPED descriptor ${table} must declare organization_id or an explicit path/self scope`,
      );
    }

    if (descriptor.scopingKind === 'fk_path') {
      actualScopedFkPathTables.add(table);

      if (!descriptor.fkPath?.parentTable || !descriptor.fkPath?.crossCheckTable) {
        fail(`FK-path descriptor ${table} is missing parent/cross-check metadata`);
      }
    }

    if (descriptor.scopingKind === 'direct_org_column' && table.startsWith('public.')) {
      publicDirectOrgPolicyTargetCount += 1;
    }

    if (expectedP083ParentCopyHolds.has(table)) {
      if (descriptor.scopingKind !== 'denorm_org_column') {
        fail(
          `P0.8.3 parent-copy hold ${table} must be denorm_org_column, got ${descriptor.scopingKind}`,
        );
      }

      actualP083ParentCopyHolds.add(table);
    }

    if (batchTables.has(table) && !descriptor.sourceStage?.startsWith('P0.4.')) {
      fail(`Batch-scoped table ${table} must retain its P0.4 source stage`);
    }

    if (beFkPathTables.has(table) && descriptor.scopingKind !== 'fk_path') {
      fail(`P0.4.BE table ${table} must be represented as fk_path`);
    }
  }

  if (descriptor.tier === 'BOOTSTRAP') {
    if (descriptor.scopingKind === 'bootstrap_hybrid') {
      actualBootstrapHybridTables.add(table);

      if (descriptor.orgColumn !== 'organization_id') {
        fail(`BOOTSTRAP hybrid descriptor ${table} must declare organization_id`);
      }
    } else if (descriptor.scopingKind === 'bootstrap_hybrid_org_gated') {
      actualBootstrapHybridOrgGatedTables.add(table);

      if (descriptor.orgColumn !== 'organization_id') {
        fail(`BOOTSTRAP org-gated hybrid descriptor ${table} must declare organization_id`);
      }

      if (descriptor.predicateTemplate !== 'org_gated_null_bootstrap') {
        fail(`BOOTSTRAP org-gated hybrid descriptor ${table} must use org_gated_null_bootstrap`);
      }
    } else if (descriptor.scopingKind === 'bootstrap_runtime_audience') {
      actualBootstrapRuntimeAudienceTables.add(table);

      if (
        descriptor.orgColumn !== 'organization_id' ||
        descriptor.audienceColumn !== 'audience' ||
        descriptor.predicateTemplate !== 'safe_audience_global_or_tenant_row' ||
        JSON.stringify(descriptor.safeAudiences) !==
          JSON.stringify(['public', 'authenticated_client'])
      ) {
        fail(
          `BOOTSTRAP runtime-audience descriptor ${table} must preserve safe audience and org semantics`,
        );
      }
    } else if (descriptor.scopingKind === 'bootstrap_runtime_audit') {
      actualBootstrapRuntimeAuditTables.add(table);

      if (
        descriptor.orgColumn !== 'organization_id' ||
        descriptor.predicateTemplate !== 'staff_global_or_exact_org_audit'
      ) {
        fail(
          `BOOTSTRAP runtime-audit descriptor ${table} must preserve staff-only audit semantics`,
        );
      }
    } else if (descriptor.scopingKind !== 'bootstrap_global') {
      fail(`Invalid BOOTSTRAP scoping kind for ${table}: ${descriptor.scopingKind}`);
    }
  }

  if (['INFRA', 'LEGACY', 'TELEMETRY'].includes(descriptor.tier)) {
    if (descriptor.scopingKind !== 'explicit_exemption' || !descriptor.source) {
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
    `Unexpected BOOTSTRAP hybrid set. Missing: ${setDiff(expectedBootstrapHybridTables, actualBootstrapHybridTables).join(', ')}. Extra: ${setDiff(actualBootstrapHybridTables, expectedBootstrapHybridTables).join(', ')}`,
  );
}

if (!sameSet(actualBootstrapHybridOrgGatedTables, expectedBootstrapHybridOrgGatedTables)) {
  fail(
    `Unexpected BOOTSTRAP org-gated hybrid set. Missing: ${setDiff(expectedBootstrapHybridOrgGatedTables, actualBootstrapHybridOrgGatedTables).join(', ')}. Extra: ${setDiff(actualBootstrapHybridOrgGatedTables, expectedBootstrapHybridOrgGatedTables).join(', ')}`,
  );
}

if (!sameSet(actualBootstrapRuntimeAudienceTables, expectedBootstrapRuntimeAudienceTables)) {
  fail(
    `Unexpected BOOTSTRAP runtime-audience set. Missing: ${setDiff(expectedBootstrapRuntimeAudienceTables, actualBootstrapRuntimeAudienceTables).join(', ')}. Extra: ${setDiff(actualBootstrapRuntimeAudienceTables, expectedBootstrapRuntimeAudienceTables).join(', ')}`,
  );
}

if (!sameSet(actualBootstrapRuntimeAuditTables, expectedBootstrapRuntimeAuditTables)) {
  fail(
    `Unexpected BOOTSTRAP runtime-audit set. Missing: ${setDiff(expectedBootstrapRuntimeAuditTables, actualBootstrapRuntimeAuditTables).join(', ')}. Extra: ${setDiff(actualBootstrapRuntimeAuditTables, expectedBootstrapRuntimeAuditTables).join(', ')}`,
  );
}

if (!sameSet(actualScopedFkPathTables, expectedScopedFkPathTables)) {
  fail(
    `Unexpected SCOPED FK-path set. Missing: ${setDiff(expectedScopedFkPathTables, actualScopedFkPathTables).join(', ')}. Extra: ${setDiff(actualScopedFkPathTables, expectedScopedFkPathTables).join(', ')}`,
  );
}

if (!sameSet(actualP083ParentCopyHolds, expectedP083ParentCopyHolds)) {
  fail(
    `Unexpected P0.8.3 parent-copy hold set. Missing: ${setDiff(expectedP083ParentCopyHolds, actualP083ParentCopyHolds).join(', ')}. Extra: ${setDiff(actualP083ParentCopyHolds, expectedP083ParentCopyHolds).join(', ')}`,
  );
}

if (publicDirectOrgPolicyTargetCount !== expectedPublicDirectOrgPolicyTargets) {
  fail(
    `Expected ${expectedPublicDirectOrgPolicyTargets} public direct-org P0.8.3 policy targets, got ${publicDirectOrgPolicyTargetCount}`,
  );
}

console.log('P0.8.1 RLS descriptor model OK: 237 descriptors cover tiers-218.tsv exactly once.');
console.log(
  Array.from(actualTierCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tier, count]) => `${tier}=${count}`)
    .join(' '),
);
console.log(
  `SCOPED sources: batch=${batchTables.size}, be_fk_path=${actualScopedFkPathTables.size}, be_direct_or_self=${
    expectedTierCounts.get('SCOPED') - batchTables.size - actualScopedFkPathTables.size
  }`,
);
console.log(
  `P0.8.3 public direct-org targets=${publicDirectOrgPolicyTargetCount}; parent-copy holds=${actualP083ParentCopyHolds.size}`,
);
