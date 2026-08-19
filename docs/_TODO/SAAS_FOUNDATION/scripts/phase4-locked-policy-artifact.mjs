#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getP083PublicDirectOrgDescriptors, p083PolicyName } from './p0-8-3-policy-targets.mjs';
import { getP084PublicPathDescriptors, p084PolicyName } from './p0-8-4-policy-targets.mjs';
import { getP085IntegratorScopedDescriptors, p085PolicyName } from './p0-8-5-policy-targets.mjs';
import { getP086BootstrapHybridDescriptors, p086PolicyName } from './p0-8-6-policy-targets.mjs';
import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import {
  hasAnyPatientOwnership,
  dormantCompatibilityPredicate,
  renderBootstrapHybridOrgGatedPredicate,
  renderBootstrapHybridPredicate,
  renderCreatePolicy,
  renderDropPolicy,
  renderEnableRowLevelSecurity,
  renderFkPathPatientPredicate,
  renderFkPathPredicate,
  renderOrgPredicate,
  renderPatientPredicateForDescriptor,
  renderStaffActorCheck,
} from './rls-sql-renderer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

export const phase4LockedPolicyArtifactPath =
  'deploy/postgres/phase4-locked-helper-rls-policies.sql';

const s5RuntimePolicyName = 's5_runtime_settings_isolation';
const s5RuntimeAuditPolicyName = 's5_runtime_settings_audit_staff';

export function getS5RuntimeSettingsTargets() {
  const descriptors = buildRlsDescriptors();
  const runtime = descriptors.get('public.app_runtime_settings');
  const audit = descriptors.get('public.app_runtime_settings_audit');

  if (runtime?.scopingKind !== 'bootstrap_runtime_audience') {
    throw new Error('S5 runtime settings descriptor is missing its audience-aware classification');
  }
  if (audit?.scopingKind !== 'bootstrap_runtime_audit') {
    throw new Error(
      'S5 runtime settings audit descriptor is missing its staff-only classification',
    );
  }

  return [
    {
      descriptor: runtime,
      policyName: s5RuntimePolicyName,
      legacyPolicyNames: ['app_runtime_settings_safe_read', 'app_runtime_settings_staff_write'],
    },
    { descriptor: audit, policyName: s5RuntimeAuditPolicyName, legacyPolicyNames: [] },
  ];
}

function compareTable(left, right) {
  return left.descriptor.table.localeCompare(right.descriptor.table);
}

export function getPhase4LockedPolicyTargets() {
  const targets = [
    ...getP083PublicDirectOrgDescriptors().map((descriptor) => ({
      descriptor,
      policyName: p083PolicyName,
    })),
    ...getP084PublicPathDescriptors().map((descriptor) => ({
      descriptor,
      policyName: p084PolicyName,
    })),
    ...getP085IntegratorScopedDescriptors().map((descriptor) => ({
      descriptor,
      policyName: p085PolicyName,
    })),
    ...getP086BootstrapHybridDescriptors().map((descriptor) => ({
      descriptor,
      policyName: p086PolicyName,
    })),
    ...getS5RuntimeSettingsTargets(),
  ].sort(compareTable);

  const keys = targets.map(({ descriptor, policyName }) => `${descriptor.table}\t${policyName}`);
  const uniqueKeys = new Set(keys);
  const uniqueTables = new Set(targets.map(({ descriptor }) => descriptor.table));

  // Зашитое число целей убрано 29.07 (решение владельца: «сноси машинерию, оставляй пользу»).
  // Полезное осталось: цели обязаны быть уникальны — дубль политики на таблицу это ошибка,
  // а не изменение объёма схемы.
  if (uniqueKeys.size !== targets.length || uniqueTables.size !== targets.length) {
    throw new Error(
      `Duplicate phase4 locked policy targets: targets=${targets.length}, uniquePolicyPairs=${uniqueKeys.size}, uniqueTables=${uniqueTables.size}`,
    );
  }

  return targets;
}

export function renderPhase4StrictPredicate(descriptor) {
  if (descriptor.scopingKind === 'bootstrap_runtime_audience') {
    const orgPredicate = renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });
    return `((current_user = 'app_staff' AND ${orgPredicate}) OR (current_user = 'app_patient' AND "audience" IN ('public', 'authenticated_client') AND ${orgPredicate}) OR (current_user = 'app_runtime_nonstaff_login' AND "audience" = 'public' AND ${orgPredicate}) OR (pg_has_role(current_user, 'app_worker', 'member') AND "audience" = 'server' AND "organization_id" IS NULL AND app.current_org_id() IS NULL))`;
  }

  if (descriptor.scopingKind === 'bootstrap_runtime_audit') {
    return `(current_user = 'app_staff' AND ${renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn })})`;
  }

  if (descriptor.scopingKind === 'bootstrap_hybrid_org_gated') {
    return renderBootstrapHybridOrgGatedPredicate({ orgColumn: descriptor.orgColumn });
  }

  if (descriptor.scopingKind === 'bootstrap_hybrid') {
    return renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });
  }

  const orgPredicate =
    descriptor.scopingKind === 'fk_path'
      ? renderFkPathPredicate(descriptor, { mode: 'enforce' })
      : renderOrgPredicate(descriptor, { mode: 'enforce' });
  const staffOrgPredicate = `(${renderStaffActorCheck()} AND ${orgPredicate})`;

  if (!hasAnyPatientOwnership(descriptor)) {
    return staffOrgPredicate;
  }

  if (descriptor.scopingKind === 'fk_path') {
    return `(${staffOrgPredicate} OR ${renderFkPathPatientPredicate(descriptor)})`;
  }

  // Форма здесь — `(staff AND org) OR (пациентская ветка)`, то есть организация НЕ стоит над всем
  // выражением. Собственно пациентские ветки свою организацию несут (её дописывает classSafe в
  // declaration.ts для org-таблиц), а вот «общие» вырезы внутри пациентской ветки — «строка без
  // владельца» (media_folders.patient_user_id IS NULL) и «каталожные target_type» (comments) —
  // никакой организации не несли и были истинны для любого принципала. Поэтому вырезам явно
  // передаётся организационный предикат: «общая» строка общая ВНУТРИ своей клиники.
  return `(${staffOrgPredicate} OR ${renderPatientPredicateForDescriptor(descriptor, { patientMode: 'enforce', sharedScopeSql: orgPredicate })})`;
}

export function renderPhase4DormantCompatPredicate(descriptor) {
  const strictPredicate = renderPhase4StrictPredicate(descriptor);

  if (
    descriptor.dormantMode === 'strict' ||
    descriptor.scopingKind === 'bootstrap_hybrid' ||
    descriptor.scopingKind === 'bootstrap_runtime_audience' ||
    descriptor.scopingKind === 'bootstrap_runtime_audit'
  ) {
    return strictPredicate;
  }

  return `((${dormantCompatibilityPredicate}) OR ${strictPredicate})`;
}

export function renderPhase4PolicyReplacement({ descriptor, policyName, legacyPolicyNames = [] }) {
  const target = descriptor.table;
  const strictPredicate = renderPhase4StrictPredicate(descriptor);
  const dormantCompatPredicate = renderPhase4DormantCompatPredicate(descriptor);

  return [
    `-- ${target} (${policyName})`,
    renderEnableRowLevelSecurity(target),
    renderDropPolicy({ policyName, target }),
    ...legacyPolicyNames.map((legacyPolicyName) =>
      renderDropPolicy({ policyName: legacyPolicyName, target }),
    ),
    '\\if :phase4_enforce_locked_context',
    renderCreatePolicy({ policyName, target, predicate: strictPredicate }),
    '\\else',
    renderCreatePolicy({ policyName, target, predicate: dormantCompatPredicate }),
    '\\endif',
  ].join('\n');
}

export function renderPhase4LockedPolicyArtifact({
  targets = getPhase4LockedPolicyTargets(),
} = {}) {
  const body = targets.map(renderPhase4PolicyReplacement).join('\n\n');

  return `${[
    '-- Phase 4 locked-helper RLS policy replacement.',
    '--',
    '-- Default mode is dormant-compatible: existing non-context legacy sessions keep working, but',
    '-- predicates no longer trust raw app.org/app.patient_user_id/app.integrator_user_id GUCs.',
    '--',
    '-- Cutover mode:',
    '--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -v phase4_enforce_locked_context=1 \\',
    '--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql',
    '--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/phase4-force-rls-cutover.sql',
    '--',
    '-- Dormant compatibility mode (default, no flip):',
    '--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 \\',
    '--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql',
    '--',
    '-- Requires deploy/postgres/p2-b-protected-principal-context.sql first. This artifact intentionally',
    '-- contains no environment references or database names.',
    '',
    '\\set ON_ERROR_STOP on',
    '',
    '\\if :{?phase4_enforce_locked_context}',
    '\\else',
    '\\set phase4_enforce_locked_context 0',
    '\\endif',
    '',
    "SELECT 1 / (:'phase4_enforce_locked_context' IN ('0', '1'))::int AS phase4_enforce_locked_context_is_valid;",
    '',
    'BEGIN;',
    '',
    body,
    '',
    'COMMIT;',
    '',
  ].join('\n')}`;
}

function printSummary() {
  const targets = getPhase4LockedPolicyTargets();
  const byPolicy = new Map();

  for (const { policyName } of targets) {
    byPolicy.set(policyName, (byPolicy.get(policyName) ?? 0) + 1);
  }

  console.log(`phase4 locked policy targets: ${targets.length}`);
  for (const [policyName, count] of [...byPolicy.entries()].sort()) {
    console.log(`${policyName}: ${count}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? '--stdout';
  const artifact = renderPhase4LockedPolicyArtifact();

  if (command === '--stdout') {
    process.stdout.write(artifact);
  } else if (command === '--write') {
    const targetPath = path.join(repoRoot, phase4LockedPolicyArtifactPath);
    writeFileSync(targetPath, artifact);
    console.log(`wrote ${phase4LockedPolicyArtifactPath}`);
  } else if (command === '--summary') {
    printSummary();
  } else {
    throw new Error(`Unsupported command ${command}. Use --stdout, --write, or --summary.`);
  }
}
