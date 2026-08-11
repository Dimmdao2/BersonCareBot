#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  expectedP085IntegratorDirectUserBridgeTargets,
  expectedP085IntegratorIdentityBridgeTargets,
  expectedP085IntegratorParentDenormTargets,
  getP085IntegratorScopedDescriptors,
  p085PolicyName,
  renderP085PolicyStatements,
} from './p0-8-5-policy-targets.mjs';

const p04MigrationChecks = Object.freeze([
  {
    sourceStage: 'P0.4.I1',
    path: 'apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
    targets: expectedP085IntegratorDirectUserBridgeTargets,
    requiredTokens: [
      'expected no NULL organization_id rows',
      'expected no multi-org direct integrator users',
      'direct-user rows using default-org fallback',
    ],
  },
  {
    sourceStage: 'P0.4.I2',
    path: 'apps/integrator/src/infra/db/migrations/core/20260708_0002_p0_4_i2_integrator_identity_path_org.sql',
    targets: expectedP085IntegratorIdentityBridgeTargets,
    requiredTokens: [
      'expected no NULL organization_id rows',
      'expected no multi-org identity-path integrator users',
      'identity-path rows using default-org fallback',
    ],
  },
  {
    sourceStage: 'P0.4.I3',
    path: 'apps/integrator/src/infra/db/migrations/core/20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql',
    targets: expectedP085IntegratorParentDenormTargets,
    requiredTokens: [
      'expected no NULL organization_id rows',
      'expected no child/parent organization mismatches',
    ],
  },
]);

function fail(message) {
  throw new Error(message);
}

function assertP04MigrationArtifacts() {
  for (const check of p04MigrationChecks) {
    const sql = readFileSync(check.path, 'utf8');

    for (const table of check.targets) {
      if (!sql.includes(table)) {
        fail(`${check.sourceStage} migration ${check.path} does not mention ${table}`);
      }
    }

    for (const token of check.requiredTokens) {
      if (!sql.includes(token)) {
        fail(
          `${check.sourceStage} migration ${check.path} is missing required assertion token: ${token}`,
        );
      }
    }
  }
}

const descriptors = getP085IntegratorScopedDescriptors();
const statements = renderP085PolicyStatements({ descriptors });
const sql = statements.join('\n');

assertP04MigrationArtifacts();

if (sql.includes('FORCE ROW LEVEL SECURITY')) {
  fail('P0.8.5 dormant generated SQL must not include FORCE ROW LEVEL SECURITY');
}

for (const descriptor of descriptors) {
  if (!['direct_org_column', 'denorm_org_column'].includes(descriptor.scopingKind)) {
    fail(`Unexpected P0.8.5 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
  }

  if (!['P0.4.I1', 'P0.4.I2', 'P0.4.I3'].includes(descriptor.sourceStage)) {
    fail(`Unexpected P0.8.5 source stage for ${descriptor.table}: ${descriptor.sourceStage}`);
  }

  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');

  if (!sql.includes(`ALTER TABLE ${quotedTarget} ENABLE ROW LEVEL SECURITY;`)) {
    fail(`Missing ENABLE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`DROP POLICY IF EXISTS "${p085PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (sql.includes('ALTER TABLE "public".')) {
  fail('P0.8.5 generated SQL must not target public tables');
}

// The surviving post-drop I3 reminder targets are chain-owned: their patient identity is reached
// through canonical public.reminder_rules and the dedicated bigint integrator-user context.
const patientOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientColumn);
const patientOwnedTables = new Set(patientOwnedDescriptors.map((descriptor) => descriptor.table));
const expectedPatientOwnedTables = new Set(expectedP085IntegratorDirectUserBridgeTargets);
if (
  [...patientOwnedTables].some((table) => !expectedPatientOwnedTables.has(table)) ||
  [...expectedPatientOwnedTables].some((table) => !patientOwnedTables.has(table))
) {
  fail('P0.8.5 patient-owned targets must match the active direct-user-bridge targets');
}

for (const descriptor of patientOwnedDescriptors) {
  if (descriptor.sourceStage !== 'P0.4.I1') {
    fail(
      `${descriptor.table} patient-owned target must be a P0.4.I1 direct-user-bridge table, got ${descriptor.sourceStage}`,
    );
  }

  if (descriptor.patientColumnCastType !== 'bigint') {
    fail(
      `${descriptor.table} integrator patient column must cast to bigint, got ${descriptor.patientColumnCastType}`,
    );
  }

  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} patient-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (
    !createStatement.includes(`"${descriptor.patientColumn}" = app.current_integrator_user_id()`)
  ) {
    fail(
      `${descriptor.table} patient predicate must compare its bigint ${descriptor.patientColumn} column against app.current_integrator_user_id()`,
    );
  }

  if (createStatement.includes('app.current_patient_user_id()')) {
    fail(
      `${descriptor.table} bigint patient predicate must NOT reference app.current_patient_user_id()`,
    );
  }
}

const patientChainOwnedDescriptors = descriptors.filter((descriptor) => descriptor.patientChain);

const expectedChainTables = [
  ...expectedP085IntegratorIdentityBridgeTargets,
  ...expectedP085IntegratorParentDenormTargets,
].sort();

if (
  JSON.stringify(patientChainOwnedDescriptors.map((d) => d.table).sort()) !==
  JSON.stringify(expectedChainTables)
) {
  fail(
    `P0.8.5 patient-chain-owned target set must stay stable: ${patientChainOwnedDescriptors.map((d) => d.table).join(', ')}`,
  );
}

for (const descriptor of patientChainOwnedDescriptors) {
  if (!['P0.4.I2', 'P0.4.I3'].includes(descriptor.sourceStage)) {
    fail(
      `${descriptor.table} chain-owned target must be P0.4.I2 or P0.4.I3, got ${descriptor.sourceStage}`,
    );
  }

  if (descriptor.patientChain.castType !== 'bigint') {
    fail(
      `${descriptor.table} integrator chain must cast to bigint, got ${descriptor.patientChain.castType}`,
    );
  }

  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
  const createStatement = statements.find((statement) =>
    statement.startsWith(`CREATE POLICY "${p085PolicyName}" ON ${quotedTarget}`),
  );

  if (!createStatement?.includes('app.is_staff()')) {
    fail(
      `${descriptor.table} chain-owned policy must include the fail-closed staff-or-patient branch`,
    );
  }

  if (!createStatement.includes('EXISTS (')) {
    fail(
      `${descriptor.table} chain-owned policy must include an EXISTS chain to its identity-bearing table`,
    );
  }

  if (
    !createStatement.includes(
      `"${descriptor.patientChain.terminalColumn}" = app.current_integrator_user_id()`,
    )
  ) {
    fail(
      `${descriptor.table} chain-owned policy must terminate on its bigint owner column via app.current_integrator_user_id()`,
    );
  }
}

console.log('P0.8.5 policy generator OK: active integrator targets match source artifacts.');
