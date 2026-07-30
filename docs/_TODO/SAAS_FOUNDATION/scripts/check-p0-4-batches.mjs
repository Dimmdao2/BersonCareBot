#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const batchPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-batches.tsv';
const needsPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/needs-orgid-FINAL.txt';
const tiersPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv';

const lines = readFileSync(batchPath, 'utf8').trimEnd().split('\n');
const header = lines.shift();

if (header !== 'batch\ttable\torg_resolution\timplementation_note') {
  throw new Error(`Unexpected header in ${batchPath}: ${header}`);
}

const assignments = new Map();
const duplicates = new Set();

for (const [index, line] of lines.entries()) {
  const lineNumber = index + 2;
  const [batch, table, orgResolution, implementationNote] = line.split('\t');

  if (!batch || !table || !orgResolution || !implementationNote) {
    throw new Error(`Missing field in ${batchPath}:${lineNumber}`);
  }

  if (assignments.has(table)) {
    duplicates.add(table);
  }

  assignments.set(table, batch);
}

if (duplicates.size > 0) {
  throw new Error(`Duplicate table assignments: ${Array.from(duplicates).sort().join(', ')}`);
}

const needs = readFileSync(needsPath, 'utf8').trim().split('\n').filter(Boolean).sort();

const assigned = Array.from(assignments.keys()).sort();

const missing = needs.filter((table) => !assignments.has(table));
const extra = assigned.filter((table) => !needs.includes(table));

if (missing.length > 0) {
  throw new Error(`Missing batch assignments: ${missing.join(', ')}`);
}

if (extra.length > 0) {
  throw new Error(`Extra batch assignments outside needs-orgid-FINAL: ${extra.join(', ')}`);
}

const scopedTables = new Set(
  readFileSync(tiersPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('|'))
    .filter(([tier]) => tier === 'SCOPED')
    .map(([, table]) => table),
);

const notScoped = assigned.filter((table) => !scopedTables.has(table));

if (notScoped.length > 0) {
  throw new Error(`Assigned tables are not SCOPED in tiers-218.tsv: ${notScoped.join(', ')}`);
}

console.log('P0.4 batch manifest OK: active assignments match the source registry.');
