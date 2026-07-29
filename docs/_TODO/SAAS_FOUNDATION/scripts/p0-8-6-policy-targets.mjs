#!/usr/bin/env node

import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import {
  renderBootstrapHybridOrgGatedPolicyStatements,
  renderBootstrapHybridPolicyStatements,
} from './rls-sql-renderer.mjs';

export const p086PolicyName = 'saas_bootstrap_hybrid_p0_8_6';

export const expectedP086BootstrapHybridTargets = Object.freeze([
  'public.platform_user_contacts',
  'public.system_settings',
  'public.system_settings_audit',
  'public.user_phone_history',
]);

const expectedTargetSet = new Set(expectedP086BootstrapHybridTargets);

const expectedBootstrapHybridTables = new Set([
  'public.system_settings',
  'public.system_settings_audit',
]);

const expectedBootstrapHybridOrgGatedTables = new Set([
  'public.platform_user_contacts',
  'public.user_phone_history',
]);

function setDiff(left, right) {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
}

function sortedDescriptors(descriptors) {
  return descriptors.sort((left, right) => left.table.localeCompare(right.table));
}

export function getP086BootstrapHybridDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const targets = sortedDescriptors(
    Array.from(descriptors.values()).filter(
      (descriptor) =>
        descriptor.scopingKind === 'bootstrap_hybrid' ||
        descriptor.scopingKind === 'bootstrap_hybrid_org_gated',
    ),
  );

  assertP086BootstrapHybridTargets(targets);

  return targets;
}

export function assertP086BootstrapHybridTargets(targets) {
  const actualTables = targets.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  if (actualTables.length !== 4) {
    throw new Error(`Expected 4 P0.8.6 BOOTSTRAP hybrid targets, got ${actualTables.length}`);
  }

  if (actualSet.size !== actualTables.length) {
    throw new Error('P0.8.6 BOOTSTRAP hybrid targets contain duplicates');
  }

  const missing = setDiff(expectedTargetSet, actualSet);
  const extra = setDiff(actualSet, expectedTargetSet);

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `P0.8.6 target set mismatch. Missing: ${missing.join(', ') || '<none>'}. Extra: ${
        extra.join(', ') || '<none>'
      }`,
    );
  }

  for (const descriptor of targets) {
    if (descriptor.tier !== 'BOOTSTRAP') {
      throw new Error(
        `P0.8.6 target ${descriptor.table} must be BOOTSTRAP, got ${descriptor.tier}`,
      );
    }

    const expectedScopingKind = expectedBootstrapHybridOrgGatedTables.has(descriptor.table)
      ? 'bootstrap_hybrid_org_gated'
      : 'bootstrap_hybrid';

    if (descriptor.scopingKind !== expectedScopingKind) {
      throw new Error(
        `P0.8.6 target ${descriptor.table} must use ${expectedScopingKind}, got ${descriptor.scopingKind}`,
      );
    }

    if (descriptor.orgColumn !== 'organization_id') {
      throw new Error(`P0.8.6 target ${descriptor.table} must use nullable organization_id`);
    }

    const expectedPredicateTemplate = expectedBootstrapHybridOrgGatedTables.has(descriptor.table)
      ? 'org_gated_null_bootstrap'
      : 'organization_id_is_null_or_matches_app_org';

    if (descriptor.predicateTemplate !== expectedPredicateTemplate) {
      throw new Error(
        `P0.8.6 target ${descriptor.table} has unexpected predicate template ${descriptor.predicateTemplate}`,
      );
    }
  }

  const bootstrapHybridTables = new Set(
    targets
      .filter((descriptor) => descriptor.scopingKind === 'bootstrap_hybrid')
      .map((descriptor) => descriptor.table),
  );
  const bootstrapHybridOrgGatedTables = new Set(
    targets
      .filter((descriptor) => descriptor.scopingKind === 'bootstrap_hybrid_org_gated')
      .map((descriptor) => descriptor.table),
  );

  if (
    setDiff(expectedBootstrapHybridTables, bootstrapHybridTables).length > 0 ||
    setDiff(bootstrapHybridTables, expectedBootstrapHybridTables).length > 0
  ) {
    throw new Error('P0.8.6 bootstrap_hybrid table set mismatch');
  }

  if (
    setDiff(expectedBootstrapHybridOrgGatedTables, bootstrapHybridOrgGatedTables).length > 0 ||
    setDiff(bootstrapHybridOrgGatedTables, expectedBootstrapHybridOrgGatedTables).length > 0
  ) {
    throw new Error('P0.8.6 bootstrap_hybrid_org_gated table set mismatch');
  }
}

export function renderP086PolicyStatements({
  descriptors = getP086BootstrapHybridDescriptors(),
} = {}) {
  return descriptors.flatMap((descriptor) => {
    if (descriptor.scopingKind === 'bootstrap_hybrid_org_gated') {
      return renderBootstrapHybridOrgGatedPolicyStatements(descriptor, {
        policyName: p086PolicyName,
      });
    }

    return renderBootstrapHybridPolicyStatements(descriptor, { policyName: p086PolicyName });
  });
}

function printCli(format) {
  const descriptors = getP086BootstrapHybridDescriptors();

  if (format === '--json') {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === '--sql') {
    console.log(renderP086PolicyStatements({ descriptors }).join('\n'));
    return;
  }

  if (format === '--targets' || format == null) {
    console.log(descriptors.map((descriptor) => descriptor.table).join('\n'));
    return;
  }

  throw new Error(`Unsupported format ${format}. Use --targets, --json, or --sql.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
