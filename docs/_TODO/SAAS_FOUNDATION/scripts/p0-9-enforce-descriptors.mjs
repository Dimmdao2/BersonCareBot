#!/usr/bin/env node

import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import {
  hasAnyPatientOwnership,
  renderBootstrapHybridOrgGatedPredicate,
  renderBootstrapHybridPredicate,
  renderCreatePolicy,
  renderDropPolicy,
  renderEnableRowLevelSecurity,
  renderFkPathPatientPredicate,
  renderFkPathPredicate,
  renderForceRowLevelSecurity,
  renderOrgPredicate,
  renderStaffActorCheck,
  renderStaffOrPatientPredicateForDescriptor,
} from './rls-sql-renderer.mjs';

export const p09PolicyName = 'saas_enforce_default_deny_p0_9_1';

export const p09EnforceActions = new Set([
  'scoped_org',
  'scoped_fk_path',
  'scoped_pending_default_deny',
  'bootstrap_hybrid',
  'bootstrap_hybrid_org_gated',
  'bootstrap_global_read',
  'explicit_global',
  'legacy_frozen_deny',
  'deny',
]);

const orgColumnScopedKinds = new Set(['direct_org_column', 'denorm_org_column', 'self_org_id']);

function defaultDenyDescriptor(table = '<unknown>', reason = 'missing_or_unknown_descriptor') {
  return {
    table,
    tier: 'UNKNOWN',
    scopingKind: 'missing_descriptor',
    predicateTemplate: 'deny_all',
    source: reason,
    enforceMode: {
      action: 'deny',
      failClosed: true,
      fallback: 'deny',
      reason,
    },
  };
}

export function buildP09EnforceDescriptor(descriptor) {
  if (!descriptor) {
    return defaultDenyDescriptor();
  }

  const base = {
    ...descriptor,
    enforceMode: {
      failClosed: true,
      fallback: 'deny',
    },
  };

  if (descriptor.tier === 'SCOPED') {
    if (orgColumnScopedKinds.has(descriptor.scopingKind)) {
      return {
        ...base,
        predicateTemplate: 'org_column_matches_app_org_enforce',
        enforceMode: {
          ...base.enforceMode,
          action: 'scoped_org',
          reason: 'scoped_row_requires_matching_app_org',
        },
      };
    }

    if (descriptor.scopingKind === 'fk_path') {
      return {
        ...base,
        predicateTemplate: 'fk_path_parent_org_matches_app_org_enforce',
        enforceMode: {
          ...base.enforceMode,
          action: 'scoped_fk_path',
          reason: 'scoped_fk_path_requires_matching_app_org',
        },
      };
    }

    if (descriptor.scopingKind === 'polymorphic_resolver') {
      return {
        ...base,
        predicateTemplate: 'deny_all',
        enforceMode: {
          ...base.enforceMode,
          action: 'scoped_pending_default_deny',
          reason: 'polymorphic_resolver_requires_p0_12_1_before_enforce',
        },
      };
    }
  }

  if (descriptor.tier === 'BOOTSTRAP') {
    if (descriptor.scopingKind === 'bootstrap_hybrid') {
      return {
        ...base,
        predicateTemplate: 'organization_id_is_null_or_matches_app_org',
        enforceMode: {
          ...base.enforceMode,
          action: 'bootstrap_hybrid',
          reason: 'global_rows_readable_pre_context_org_rows_require_matching_app_org',
        },
      };
    }

    if (descriptor.scopingKind === 'bootstrap_hybrid_org_gated') {
      return {
        ...base,
        predicateTemplate: 'org_gated_null_bootstrap',
        enforceMode: {
          ...base.enforceMode,
          action: 'bootstrap_hybrid_org_gated',
          reason:
            'null_rows_readable_only_to_contextless_bootstrap_org_rows_require_matching_app_org',
        },
      };
    }

    if (descriptor.scopingKind === 'bootstrap_global') {
      return {
        ...base,
        predicateTemplate: 'allow_all_explicit_bootstrap_global',
        enforceMode: {
          ...base.enforceMode,
          action: 'bootstrap_global_read',
          reason: 'identity_bootstrap_readable_before_org_context',
        },
      };
    }
  }

  if (descriptor.tier === 'INFRA' || descriptor.tier === 'TELEMETRY') {
    return {
      ...base,
      predicateTemplate: 'allow_all_explicit_global_exemption',
      enforceMode: {
        ...base.enforceMode,
        action: 'explicit_global',
        reason: descriptor.source,
      },
    };
  }

  if (descriptor.tier === 'LEGACY') {
    return {
      ...base,
      predicateTemplate: 'deny_all',
      enforceMode: {
        ...base.enforceMode,
        action: 'legacy_frozen_deny',
        reason: 'legacy_frozen_until_sunset_no_enforce_read_path',
      },
    };
  }

  return defaultDenyDescriptor(descriptor.table, 'unsupported_descriptor_state');
}

export function buildP09EnforceDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  return new Map(
    Array.from(descriptors.entries()).map(([table, descriptor]) => [
      table,
      buildP09EnforceDescriptor(descriptor),
    ]),
  );
}

export function getP09EnforceDescriptorByTable(
  table,
  { descriptors = buildRlsDescriptors() } = {},
) {
  return buildP09EnforceDescriptors({ descriptors }).get(table) ?? defaultDenyDescriptor(table);
}

function sortedDescriptors(descriptors) {
  return descriptors.sort((left, right) => left.table.localeCompare(right.table));
}

export function getP09EnforceDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const enforceDescriptors = sortedDescriptors(
    Array.from(buildP09EnforceDescriptors({ descriptors }).values()),
  );

  assertP09EnforceDescriptors(enforceDescriptors);

  return enforceDescriptors;
}

export function countP09EnforceActions(descriptors) {
  const counts = new Map();

  for (const descriptor of descriptors) {
    const action = descriptor.enforceMode?.action;
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  return counts;
}

export function assertP09EnforceDescriptors(descriptors) {
  const actualTables = descriptors.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  // Зашитое общее число дескрипторов убрано 29.07 (решение владельца: «сноси машинерию, оставляй пользу»).
  // Полезное — ниже: у каждой таблицы объявлен класс, и класс должен быть известным.

  if (actualSet.size !== actualTables.length) {
    throw new Error('P0.9 enforce descriptors contain duplicate tables');
  }

  const counts = countP09EnforceActions(descriptors);

  for (const action of counts.keys()) {
    if (!p09EnforceActions.has(action)) {
      throw new Error(`Unsupported P0.9 enforce action ${action}`);
    }

  }

  for (const descriptor of descriptors) {
    if (
      descriptor.enforceMode?.failClosed !== true ||
      descriptor.enforceMode?.fallback !== 'deny'
    ) {
      throw new Error(`${descriptor.table} must declare fail-closed enforce fallback`);
    }
  }
}

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #653): patient-owned
// SCOPED tables get the fail-closed staff-or-patient branch ANDed onto the enforce-mode org
// predicate too, so a future flip migration built from this enforce model inherits the patient
// wall automatically. Staff (org-wide, variant A) is unaffected — the staff-actor check always
// bypasses the patient branch.
export function renderP09EnforcePredicate(descriptor) {
  const action = descriptor?.enforceMode?.action ?? 'deny';

  if (action === 'scoped_org') {
    const orgPredicate = renderOrgPredicate(descriptor, { mode: 'enforce' });

    if (!hasAnyPatientOwnership(descriptor)) {
      return orgPredicate;
    }

    return `(${orgPredicate} AND ${renderStaffOrPatientPredicateForDescriptor(descriptor)})`;
  }

  if (action === 'scoped_fk_path') {
    const orgPredicate = renderFkPathPredicate(descriptor, { mode: 'enforce' });

    if (!descriptor.patientColumn) {
      return orgPredicate;
    }

    const staffOrPatient = `(${renderStaffActorCheck()} OR ${renderFkPathPatientPredicate(descriptor)})`;

    return `(${orgPredicate} AND ${staffOrPatient})`;
  }

  if (action === 'bootstrap_hybrid') {
    return renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });
  }

  if (action === 'bootstrap_hybrid_org_gated') {
    return renderBootstrapHybridOrgGatedPredicate({ orgColumn: descriptor.orgColumn });
  }

  if (action === 'bootstrap_global_read' || action === 'explicit_global') {
    return 'true';
  }

  return 'false';
}

export function renderP09EnforcePolicyStatements(descriptor, { policyName = p09PolicyName } = {}) {
  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const target = descriptor?.table;

  if (typeof target !== 'string' || target.length === 0 || target === '<unknown>') {
    throw new Error('P0.9 enforce policy requires a concrete table name');
  }

  const predicate = renderP09EnforcePredicate(descriptor);

  return [
    renderEnableRowLevelSecurity(target),
    renderForceRowLevelSecurity(target),
    renderDropPolicy({ policyName, target }),
    renderCreatePolicy({ policyName, target, predicate }),
  ];
}

export function renderP09EnforcePolicySql({ descriptors = getP09EnforceDescriptors() } = {}) {
  return descriptors
    .flatMap((descriptor) => renderP09EnforcePolicyStatements(descriptor))
    .join('\n');
}

function printCli(format) {
  const descriptors = getP09EnforceDescriptors();

  if (format === '--json') {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === '--sql') {
    console.log(renderP09EnforcePolicySql({ descriptors }));
    return;
  }

  if (format === '--targets' || format == null) {
    console.log(
      descriptors
        .map((descriptor) => `${descriptor.enforceMode.action}\t${descriptor.table}`)
        .join('\n'),
    );
    return;
  }

  throw new Error(`Unsupported format ${format}. Use --targets, --json, or --sql.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
