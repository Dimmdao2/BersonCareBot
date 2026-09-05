#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  renderCreatePolicy,
  renderDropPolicy,
  renderEnableRowLevelSecurity,
} from './rls-sql-renderer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

export const phase4LockedPolicyArtifactPath =
  'deploy/postgres/phase4-locked-helper-rls-policies.sql';

// Mechanical adapter (SaaS #1069 correction §B). Table targets, policy names and the exact
// strict/dormant-compat predicates below are NOT computed here anymore — they are read straight
// from `deploy/postgres/privileges/declaration.ts`'s `REV10_LOCKED_POLICY_DATA`, the single
// human-authored source of every object-specific DB-access decision (`deploy/postgres/privileges/
// README.md`). p0-8-{3,4,5,6}-policy-targets.mjs and rls-descriptor-model.mjs no longer feed this
// file or the checked-in `phase4-locked-helper-rls-policies.sql` artifact — this module can no
// longer diverge from what declaration.ts applies at deploy time; it only re-renders that data as
// the legacy `\ir`-included SQL shape.
const declarationPath = path.join(repoRoot, 'deploy', 'postgres', 'privileges', 'declaration.ts');
const { REV10_LOCKED_POLICY_DATA } = await import(pathToFileURL(declarationPath).href);

function compareTable(left, right) {
  return left.descriptor.table.localeCompare(right.descriptor.table);
}

export function getPhase4LockedPolicyTargets() {
  const targets = Object.entries(REV10_LOCKED_POLICY_DATA)
    .map(([table, entry]) => ({
      descriptor: { table, dormantMode: entry.dormantMode },
      policyName: entry.policyName,
    }))
    .sort(compareTable);

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
  return REV10_LOCKED_POLICY_DATA[descriptor.table].strictPredicate;
}

export function renderPhase4DormantCompatPredicate(descriptor) {
  return REV10_LOCKED_POLICY_DATA[descriptor.table].dormantCompatPredicate;
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
