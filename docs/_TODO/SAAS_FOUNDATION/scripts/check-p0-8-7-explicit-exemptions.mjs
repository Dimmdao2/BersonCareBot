#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { buildRlsDescriptors, readBatchRows } from './rls-descriptor-model.mjs';

const explicitExemptionTiers = new Set(['INFRA', 'LEGACY', 'TELEMETRY']);
const deniedUserRefTiers = new Set(['INFRA', 'TELEMETRY']);
const allSignalsPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/all-218-signals.tsv';
const fkEdgesPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/fk-edges.tsv';
const methodColumnsPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/method-columns.tsv';
const priorLeakClassTables = new Set([
  'public.admin_audit_log',
  'public.broadcast_audit',
  'public.content_section_slug_history',
]);

function fail(message) {
  throw new Error(message);
}

function readLines(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean);
}

function splitArtifactLine(line) {
  if (line.includes('\\t')) {
    return line.split('\\t');
  }

  return line.split('\t');
}

function addReason(reasonsByTable, table, reason) {
  const reasons = reasonsByTable.get(table) ?? new Set();
  reasons.add(reason);
  reasonsByTable.set(table, reasons);
}

function qualifyTableName(tableName, descriptors) {
  if (descriptors.has(tableName)) {
    return tableName;
  }

  const publicTable = `public.${tableName}`;
  if (descriptors.has(publicTable)) {
    return publicTable;
  }

  const matches = Array.from(descriptors.keys()).filter((table) => table.endsWith(`.${tableName}`));
  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function readPlatformUserFkReasons(descriptors) {
  const reasonsByTable = new Map();

  for (const line of readLines(fkEdgesPath)) {
    const [childTable, parentTable] = splitArtifactLine(line);

    if (parentTable !== 'platform_users') {
      continue;
    }

    const table = qualifyTableName(childTable, descriptors);
    if (table) {
      addReason(reasonsByTable, table, 'fk_edges: FK to platform_users');
    }
  }

  return reasonsByTable;
}

function readSoftColumnReasons(descriptors) {
  const reasonsByTable = new Map();

  for (const line of readLines(methodColumnsPath)) {
    const [rawTable, userColumns = ''] = splitArtifactLine(line);

    if (!userColumns) {
      continue;
    }

    const table = qualifyTableName(rawTable, descriptors);
    if (table) {
      addReason(reasonsByTable, table, `method-columns: ${userColumns}`);
    }
  }

  for (const line of readLines(allSignalsPath)) {
    const [schema, rawTable, userColumns = ''] = splitArtifactLine(line);

    if (!schema || !rawTable || !userColumns) {
      continue;
    }

    const table = qualifyTableName(`${schema}.${rawTable}`, descriptors);
    if (table) {
      addReason(reasonsByTable, table, `all-218-signals: ${userColumns}`);
    }
  }

  return reasonsByTable;
}

function readP04ScopedArtifactReasons() {
  const reasonsByTable = new Map();

  for (const row of readBatchRows()) {
    addReason(reasonsByTable, row.table, `p0-4-batches: ${row.org_resolution}`);
  }

  return reasonsByTable;
}

function mergeReasonMaps(...maps) {
  const merged = new Map();

  for (const map of maps) {
    for (const [table, reasons] of map.entries()) {
      for (const reason of reasons) {
        addReason(merged, table, reason);
      }
    }
  }

  return merged;
}

const descriptors = buildRlsDescriptors();
const exemptionDescriptors = [];

for (const descriptor of descriptors.values()) {
  if (!explicitExemptionTiers.has(descriptor.tier)) {
    continue;
  }

  exemptionDescriptors.push(descriptor);

  if (descriptor.scopingKind !== 'explicit_exemption') {
    fail(`${descriptor.table} tier ${descriptor.tier} must use scopingKind=explicit_exemption`);
  }

  if (typeof descriptor.source !== 'string' || descriptor.source.trim() === '') {
    fail(`${descriptor.table} tier ${descriptor.tier} must declare a non-empty exemption source`);
  }
}

const userRefReasonsByTable = mergeReasonMaps(
  readPlatformUserFkReasons(descriptors),
  readSoftColumnReasons(descriptors),
  readP04ScopedArtifactReasons(),
);

const unsupportedUserRefs = Array.from(descriptors.values())
  .filter((descriptor) => deniedUserRefTiers.has(descriptor.tier))
  .flatMap((descriptor) => {
    const reasons = userRefReasonsByTable.get(descriptor.table);

    if (!reasons) {
      return [];
    }

    return [
      {
        table: descriptor.table,
        tier: descriptor.tier,
        reasons: Array.from(reasons).sort(),
      },
    ];
  })
  .sort((left, right) => left.table.localeCompare(right.table));

if (unsupportedUserRefs.length > 0) {
  const details = unsupportedUserRefs
    .map(({ table, tier, reasons }) => `${table} (${tier}) -> ${reasons.join('; ')}`)
    .join('\n');

  fail(
    `Unsupported user reference found in INFRA/TELEMETRY descriptor(s). P0.8.7 must block and not auto-scope:\n${details}`,
  );
}

for (const table of priorLeakClassTables) {
  const descriptor = descriptors.get(table);

  if (!descriptor) {
    fail(`Prior leak-class table ${table} is missing from descriptors`);
  }

  if (descriptor.tier !== 'SCOPED') {
    fail(`Prior leak-class table ${table} must remain SCOPED, got ${descriptor.tier}`);
  }

  if (!userRefReasonsByTable.has(table)) {
    fail(`Prior leak-class table ${table} is no longer covered by static user-ref artifacts`);
  }
}

const counts = exemptionDescriptors.reduce(
  (accumulator, descriptor) =>
    accumulator.set(descriptor.tier, (accumulator.get(descriptor.tier) ?? 0) + 1),
  new Map(),
);

console.log(
  `P0.8.7 explicit exemptions OK: INFRA=${counts.get('INFRA') ?? 0}, LEGACY=${
    counts.get('LEGACY') ?? 0
  }, TELEMETRY=${counts.get('TELEMETRY') ?? 0}.`,
);
console.log(
  'P0.8.7 unsupported user-ref denial OK: no INFRA/TELEMETRY descriptor has a static user ref.',
);
