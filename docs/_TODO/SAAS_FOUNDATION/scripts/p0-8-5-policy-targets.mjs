#!/usr/bin/env node

import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import { renderOrgColumnDormantPolicyStatements } from './rls-sql-renderer.mjs';

export const p085PolicyName = 'saas_org_dormant_p0_8_5';

export const expectedP085IntegratorDirectUserBridgeTargets = Object.freeze([
  'integrator.contacts',
  'integrator.content_access_grants',
  'integrator.user_reminder_rules',
]);

export const expectedP085IntegratorIdentityBridgeTargets = Object.freeze([
  'integrator.conversations',
  'integrator.message_drafts',
  'integrator.user_questions',
]);

export const expectedP085IntegratorParentDenormTargets = Object.freeze([
  'integrator.conversation_messages',
  'integrator.question_messages',
  'integrator.user_reminder_delivery_logs',
  'integrator.user_reminder_occurrences',
]);

const expectedTargetsBySourceStage = Object.freeze({
  'P0.4.I1': expectedP085IntegratorDirectUserBridgeTargets,
  'P0.4.I2': expectedP085IntegratorIdentityBridgeTargets,
  'P0.4.I3': expectedP085IntegratorParentDenormTargets,
});

const expectedTargetSet = new Set(Object.values(expectedTargetsBySourceStage).flat());

function setDiff(left, right) {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
}

function sortedDescriptors(descriptors) {
  return descriptors.sort((left, right) => left.table.localeCompare(right.table));
}

function targetsForSourceStage(targets, sourceStage) {
  return targets.filter((descriptor) => descriptor.sourceStage === sourceStage);
}

export function getP085IntegratorScopedDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const targets = sortedDescriptors(
    Array.from(descriptors.values()).filter(
      (descriptor) =>
        descriptor.tier === 'SCOPED' &&
        descriptor.table.startsWith('integrator.') &&
        ['direct_org_column', 'denorm_org_column'].includes(descriptor.scopingKind),
    ),
  );

  assertP085IntegratorScopedTargets(targets);

  return targets;
}

export function getP085IntegratorDirectUserBridgeDescriptors(options) {
  return targetsForSourceStage(getP085IntegratorScopedDescriptors(options), 'P0.4.I1');
}

export function getP085IntegratorIdentityBridgeDescriptors(options) {
  return targetsForSourceStage(getP085IntegratorScopedDescriptors(options), 'P0.4.I2');
}

export function getP085IntegratorParentDenormDescriptors(options) {
  return targetsForSourceStage(getP085IntegratorScopedDescriptors(options), 'P0.4.I3');
}

export function assertP085IntegratorScopedTargets(targets) {
  const actualTables = targets.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  if (actualSet.size !== actualTables.length) {
    throw new Error('P0.8.5 integrator SCOPED targets contain duplicates');
  }

  const missing = setDiff(expectedTargetSet, actualSet);
  const extra = setDiff(actualSet, expectedTargetSet);

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `P0.8.5 target set mismatch. Missing: ${missing.join(', ') || '<none>'}. Extra: ${
        extra.join(', ') || '<none>'
      }`,
    );
  }

  for (const [sourceStage, expectedTargets] of Object.entries(expectedTargetsBySourceStage)) {
    const actualSourceTargets = targetsForSourceStage(targets, sourceStage).map(
      (descriptor) => descriptor.table,
    );
    const actualSourceSet = new Set(actualSourceTargets);
    const expectedSourceSet = new Set(expectedTargets);

    const sourceMissing = setDiff(expectedSourceSet, actualSourceSet);
    const sourceExtra = setDiff(actualSourceSet, expectedSourceSet);

    if (sourceMissing.length > 0 || sourceExtra.length > 0) {
      throw new Error(
        `P0.8.5 ${sourceStage} mismatch. Missing: ${sourceMissing.join(', ') || '<none>'}. Extra: ${
          sourceExtra.join(', ') || '<none>'
        }`,
      );
    }
  }

  for (const descriptor of targets) {
    if (descriptor.orgColumn !== 'organization_id') {
      throw new Error(`P0.8.5 target ${descriptor.table} must use materialized organization_id`);
    }
  }
}

export function renderP085PolicyStatements({
  descriptors = getP085IntegratorScopedDescriptors(),
} = {}) {
  return descriptors.flatMap((descriptor) =>
    renderOrgColumnDormantPolicyStatements(descriptor, {
      policyName: p085PolicyName,
      scopingKinds: ['direct_org_column', 'denorm_org_column'],
    }),
  );
}

function printCli(format) {
  const descriptors = getP085IntegratorScopedDescriptors();

  if (format === '--json') {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === '--sql') {
    console.log(renderP085PolicyStatements({ descriptors }).join('\n'));
    return;
  }

  if (format === '--i1-targets') {
    console.log(
      getP085IntegratorDirectUserBridgeDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--i2-targets') {
    console.log(
      getP085IntegratorIdentityBridgeDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--i3-targets') {
    console.log(
      getP085IntegratorParentDenormDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--targets' || format == null) {
    console.log(descriptors.map((descriptor) => descriptor.table).join('\n'));
    return;
  }

  throw new Error(
    `Unsupported format ${format}. Use --targets, --i1-targets, --i2-targets, --i3-targets, --json, or --sql.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
