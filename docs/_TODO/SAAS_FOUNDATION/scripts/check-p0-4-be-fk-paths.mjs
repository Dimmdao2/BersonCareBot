#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const fkPathPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-be-fk-paths.tsv';
const tiersPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv';
const needsPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/needs-orgid-FINAL.txt';
const batchesPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-batches.tsv';
const fkEdgesPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/fk-edges.tsv';

const expectedRows = new Map([
  [
    'public.be_package_items',
    {
      parent_table: 'public.be_subscription_packages',
      local_fk: 'package_id',
      parent_pk: 'id',
      parent_org_column: 'organization_id',
      cross_check_table: 'public.be_clinic_services',
      cross_check_local_fk: 'service_id',
      cross_check_pk: 'id',
      cross_check_org_column: 'organization_id',
    },
  ],
  [
    'public.be_patient_package_items',
    {
      parent_table: 'public.be_patient_packages',
      local_fk: 'patient_package_id',
      parent_pk: 'id',
      parent_org_column: 'organization_id',
      cross_check_table: 'public.be_clinic_services',
      cross_check_local_fk: 'service_id',
      cross_check_pk: 'id',
      cross_check_org_column: 'organization_id',
    },
  ],
]);

const header = [
  'table',
  'parent_table',
  'local_fk',
  'parent_pk',
  'parent_org_column',
  'cross_check_table',
  'cross_check_local_fk',
  'cross_check_pk',
  'cross_check_org_column',
];

function readLines(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean);
}

function unqualified(tableName) {
  return tableName.replace(/^public\./, '');
}

const lines = readLines(fkPathPath);
const actualHeader = lines.shift();

if (actualHeader !== header.join('\t')) {
  throw new Error(`Unexpected header in ${fkPathPath}: ${actualHeader}`);
}

const rows = new Map();

for (const [index, line] of lines.entries()) {
  const lineNumber = index + 2;
  const fields = line.split('\t');

  if (fields.length !== header.length) {
    throw new Error(
      `Expected ${header.length} fields in ${fkPathPath}:${lineNumber}, got ${fields.length}`,
    );
  }

  const row = Object.fromEntries(header.map((key, fieldIndex) => [key, fields[fieldIndex]]));

  for (const [key, value] of Object.entries(row)) {
    if (!value) {
      throw new Error(`Missing ${key} in ${fkPathPath}:${lineNumber}`);
    }
  }

  if (rows.has(row.table)) {
    throw new Error(`Duplicate FK-path declaration for ${row.table}`);
  }

  rows.set(row.table, row);
}

const missingRows = Array.from(expectedRows.keys()).filter((tableName) => !rows.has(tableName));
const extraRows = Array.from(rows.keys()).filter((tableName) => !expectedRows.has(tableName));

if (missingRows.length > 0) {
  throw new Error(`Missing P0.4.BE FK-path declarations: ${missingRows.join(', ')}`);
}

if (extraRows.length > 0) {
  throw new Error(`Unexpected P0.4.BE FK-path declarations: ${extraRows.join(', ')}`);
}

for (const [tableName, expected] of expectedRows.entries()) {
  const actual = rows.get(tableName);

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(
        `Unexpected ${key} for ${tableName}: expected ${expectedValue}, got ${actual[key]}`,
      );
    }
  }
}

const scopedTables = new Set(
  readLines(tiersPath)
    .map((line) => line.split('|'))
    .filter(([tier]) => tier === 'SCOPED')
    .map(([, tableName]) => tableName),
);

for (const [tableName, row] of rows.entries()) {
  const relatedTables = [tableName, row.parent_table, row.cross_check_table];
  const notScoped = relatedTables.filter((relatedTable) => !scopedTables.has(relatedTable));

  if (notScoped.length > 0) {
    throw new Error(
      `P0.4.BE related tables are not SCOPED in tiers-218.tsv: ${notScoped.join(', ')}`,
    );
  }
}

const needsOrgTables = new Set(readLines(needsPath));
const wronglyNeedsOrg = Array.from(rows.keys()).filter((tableName) =>
  needsOrgTables.has(tableName),
);

if (wronglyNeedsOrg.length > 0) {
  throw new Error(
    `P0.4.BE FK-path tables must stay outside needs-orgid-FINAL: ${wronglyNeedsOrg.join(', ')}`,
  );
}

const batchTables = new Set(
  readLines(batchesPath)
    .slice(1)
    .map((line) => line.split('\t')[1])
    .filter(Boolean),
);
const wronglyBatched = Array.from(rows.keys()).filter((tableName) => batchTables.has(tableName));

if (wronglyBatched.length > 0) {
  throw new Error(
    `P0.4.BE FK-path tables must stay outside p0-4-batches.tsv: ${wronglyBatched.join(', ')}`,
  );
}

const fkEdges = new Set(readLines(fkEdgesPath).map((line) => line.split('\t').join('->')));

for (const [tableName, row] of rows.entries()) {
  const parentEdge = `${unqualified(tableName)}->${unqualified(row.parent_table)}`;
  const crossCheckEdge = `${unqualified(tableName)}->${unqualified(row.cross_check_table)}`;

  if (!fkEdges.has(parentEdge)) {
    throw new Error(`Missing FK edge in ${fkEdgesPath}: ${parentEdge}`);
  }

  if (!fkEdges.has(crossCheckEdge)) {
    throw new Error(`Missing FK edge in ${fkEdgesPath}: ${crossCheckEdge}`);
  }
}

console.log(`P0.4.BE FK-path manifest OK: ${rows.size} scoped be_* item tables declared.`);
