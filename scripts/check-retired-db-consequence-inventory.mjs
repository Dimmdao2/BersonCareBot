#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const archive = resolve(root, 'docs/archive/2026-08-no-disposable-db-retirement');
const retiredPaths = JSON.parse(readFileSync(resolve(archive, 'retired-executor-paths.json'), 'utf8'));
const inventory = JSON.parse(
  readFileSync(resolve(archive, 'retired-executor-consequences.json'), 'utf8'),
);

assert.equal(inventory.retirementParent, '0210820cd');
assert.equal(inventory.retirementCommit, 'fb44002ce');
assert(Array.isArray(retiredPaths), 'retired path registry must be an array');
assert(Array.isArray(inventory.rows), 'consequence inventory rows must be an array');

const expectedPaths = [...retiredPaths].sort();
const actualPaths = inventory.rows.map((row) => row.path).sort();
assert.deepEqual(actualPaths, expectedPaths, 'consequence inventory must classify all 123 paths exactly once');
assert.equal(new Set(actualPaths).size, 123, 'consequence inventory paths must be unique');

const allowedClassifications = new Set([
  'product-postgres-oracle',
  'independent-oracle',
  'retired-support',
  'retired-history',
]);
for (const row of inventory.rows) {
  assert.equal(typeof row.path, 'string', 'inventory path must be a string');
  assert(allowedClassifications.has(row.classification), `${row.path}: invalid classification`);
  assert(Array.isArray(row.consequences) && row.consequences.length > 0, `${row.path}: empty consequence list`);
  assert(
    row.consequences.every((value) => typeof value === 'string' && value.trim().length > 0),
    `${row.path}: consequence text must be non-empty`,
  );
  if (row.classification === 'independent-oracle') {
    assert.equal(row.replacementState, 'required-current-oracle', `${row.path}: independent oracle was hidden`);
    assert(Array.isArray(row.proofFunctions), `${row.path}: proof-function inventory is missing`);
  } else if (row.classification === 'product-postgres-oracle') {
    assert.equal(row.replacementState, 'mixed-see-named-dev-matrix');
  } else {
    assert.equal(row.replacementState, 'retired-non-oracle');
  }
}

const product = inventory.rows.filter((row) => row.classification === 'product-postgres-oracle');
const other = inventory.rows.filter((row) => row.classification !== 'product-postgres-oracle');
const productDeclarations = product.reduce((sum, row) => sum + row.consequences.length, 0);
const declarationStates = product.flatMap((row) => row.declarations ?? []);
const stateCounts = Object.fromEntries(
  [
    'static-product',
    'static-security',
    'named-dev-ready',
    'required-current-oracle',
    'retired-owner',
  ].map((state) => [state, declarationStates.filter((declaration) => declaration.state === state).length]),
);
const counts = Object.fromEntries(
  [...allowedClassifications].map((classification) => [
    classification,
    inventory.rows.filter((row) => row.classification === classification).length,
  ]),
);

assert.equal(product.length, 35, 'retired product-oracle file count changed');
assert.equal(productDeclarations, 121, 'retired product declaration count changed');
assert.equal(declarationStates.length, 121, 'every product declaration needs an exact disposition');
assert.equal(
  Object.values(stateCounts).reduce((sum, count) => sum + count, 0),
  productDeclarations,
  'computed declaration disposition counts must cover the exact product census',
);
for (const declaration of declarationStates) {
  assert.equal(typeof declaration.title, 'string');
  if (declaration.state !== 'required-current-oracle') {
    assert.equal(typeof declaration.evidence, 'string', `${declaration.title}: evidence is missing`);
  }
}
assert.equal(other.length, 88, 'all 88 non-product executor paths must be classified');
assert.deepEqual(counts, {
  'product-postgres-oracle': 35,
  'independent-oracle': 55,
  'retired-support': 29,
  'retired-history': 4,
});

console.log(
  `retired DB consequence inventory: OK (123 paths; product=${productDeclarations}: static=${stateCounts['static-product']} security=${stateCounts['static-security']} named-DEV-READY=${stateCounts['named-dev-ready']} required=${stateCounts['required-current-oracle']} retired=${stateCounts['retired-owner']}; other=${counts['independent-oracle']} independent + ${counts['retired-support']} support + ${counts['retired-history']} history)`,
);
