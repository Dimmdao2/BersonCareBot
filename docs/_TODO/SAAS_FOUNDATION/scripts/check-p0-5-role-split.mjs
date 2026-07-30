#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { buildRlsDescriptors, readTierRows } from './rls-descriptor-model.mjs';
import {
  getP05AppGrantTables,
  p05DedicatedRoleTables,
  renderP05RoleSplitSql,
} from './p0-5-role-split-sql.mjs';

const opsSqlPath = 'deploy/postgres/p0-5-role-split.sql';
const allowedGrantTiers = new Set(['SCOPED', 'BOOTSTRAP']);

function fail(message) {
  throw new Error(message);
}

function assertGrantSetMatchesTiers() {
  const expectedDedicatedTables = new Set([
    'public.app_runtime_settings',
    'public.app_runtime_settings_audit',
    'public.password_altcha_challenges',
    'public.password_login_identifier_protection',
    'public.staff_security_profiles',
    'public.user_passkey_accounts',
    'public.user_passkey_challenges',
    'public.user_passkey_credentials',
  ]);
  if (
    p05DedicatedRoleTables.size !== expectedDedicatedTables.size ||
    [...expectedDedicatedTables].some((table) => !p05DedicatedRoleTables.has(table))
  ) {
    fail('P0.5 dedicated-role exclusion set is inconsistent');
  }

  const grantTables = getP05AppGrantTables();
  const grantTableNames = new Set(grantTables.map((table) => table.qualifiedName));
  const expectedTables = new Set(
    readTierRows()
      .filter((row) => allowedGrantTiers.has(row.tier))
      .map((row) => row.table)
      .filter((table) => !p05DedicatedRoleTables.has(table)),
  );

  const missing = [...expectedTables].filter((table) => !grantTableNames.has(table));
  const unexpected = [...grantTableNames].filter((table) => !expectedTables.has(table));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(
      `P0.5 generated grant set differs from tier data: missing=${missing.join(',')}; unexpected=${unexpected.join(',')}`,
    );
  }

  const unknownTiers = [...new Set(grantTables.map((table) => table.tier))].filter(
    (tier) => !allowedGrantTiers.has(tier),
  );
  if (unknownTiers.length > 0) fail(`Unexpected P0.5 app grant tiers: ${unknownTiers.join(',')}`);
}

const renderedSql = renderP05RoleSplitSql({ descriptors: buildRlsDescriptors() });
const artifactSql = readFileSync(opsSqlPath, 'utf8');
if (artifactSql !== renderedSql) {
  fail(`${opsSqlPath} is not synchronized with p0-5-role-split-sql.mjs output`);
}
assertGrantSetMatchesTiers();
console.log('P0.5 role split generated artifact and grant classification: OK.');
