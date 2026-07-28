#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { buildRlsDescriptors, readBatchRows } from './rls-descriptor-model.mjs';

const root = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation';

const paths = {
  allSignals: `${root}/all-218-signals.tsv`,
  fkEdges: `${root}/fk-edges.tsv`,
  methodColumns: `${root}/method-columns.tsv`,
};

const allowedUserRefTiers = new Set(['SCOPED', 'BOOTSTRAP', 'LEGACY']);
const deniedUserRefTiers = new Set(['INFRA', 'TELEMETRY']);
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
  return line.includes('\\t') ? line.split('\\t') : line.split('\t');
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

function readPlatformUserFkReasons(descriptors) {
  const reasonsByTable = new Map();

  for (const line of readLines(paths.fkEdges)) {
    const [childTable, parentTable] = splitArtifactLine(line);

    if (parentTable !== 'platform_users') {
      continue;
    }

    const table = qualifyTableName(childTable, descriptors);

    if (table) {
      addReason(reasonsByTable, table, 'fk-edges: FK to platform_users');
    }
  }

  return reasonsByTable;
}

function readMethodColumnReasons(descriptors) {
  const reasonsByTable = new Map();

  for (const line of readLines(paths.methodColumns)) {
    const [rawTable, userColumns = ''] = splitArtifactLine(line);

    if (!userColumns) {
      continue;
    }

    const table = qualifyTableName(rawTable, descriptors);

    if (table) {
      addReason(reasonsByTable, table, `method-columns: ${userColumns}`);
    }
  }

  return reasonsByTable;
}

function readAllSignalsColumnReasons(descriptors) {
  const reasonsByTable = new Map();

  for (const line of readLines(paths.allSignals)) {
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
    if (row.org_resolution.includes('actor') || row.org_resolution.includes('user')) {
      addReason(reasonsByTable, row.table, `p0-4-batches: ${row.org_resolution}`);
    }
  }

  return reasonsByTable;
}

function readUserReferenceReasons(descriptors) {
  return mergeReasonMaps(
    readPlatformUserFkReasons(descriptors),
    readMethodColumnReasons(descriptors),
    readAllSignalsColumnReasons(descriptors),
    readP04ScopedArtifactReasons(),
  );
}

function assertP0102UserReferenceTierGuard({ descriptors = buildRlsDescriptors() } = {}) {
  const userRefReasonsByTable = readUserReferenceReasons(descriptors);
  const unsupported = [];
  const undocumentedAllowed = [];

  for (const [table, reasons] of userRefReasonsByTable.entries()) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      unsupported.push({ table, tier: '<missing>', reasons });
      continue;
    }

    if (deniedUserRefTiers.has(descriptor.tier)) {
      unsupported.push({ table, tier: descriptor.tier, reasons });
      continue;
    }

    if (!allowedUserRefTiers.has(descriptor.tier)) {
      unsupported.push({ table, tier: descriptor.tier, reasons });
      continue;
    }

    if (descriptor.tier === 'BOOTSTRAP' && !descriptor.source) {
      undocumentedAllowed.push({
        table,
        tier: descriptor.tier,
        reason: 'missing BOOTSTRAP source',
      });
    }

    if (descriptor.tier === 'LEGACY' && descriptor.source !== 'legacy_frozen_until_sunset') {
      undocumentedAllowed.push({
        table,
        tier: descriptor.tier,
        reason: 'LEGACY source must be legacy_frozen_until_sunset',
      });
    }

    if (descriptor.tier === 'SCOPED' && !descriptor.source && !descriptor.sourceStage) {
      undocumentedAllowed.push({
        table,
        tier: descriptor.tier,
        reason: 'SCOPED descriptor must declare source/sourceStage',
      });
    }
  }

  if (unsupported.length > 0) {
    const details = unsupported
      .sort((left, right) => left.table.localeCompare(right.table))
      .map(
        ({ table, tier, reasons }) =>
          `${table} (${tier}) -> ${Array.from(reasons).sort().join('; ')}`,
      )
      .join('\n');

    fail(
      `Unsupported platform_users reference tier(s). User refs may be SCOPED/BOOTSTRAP/LEGACY only:\n${details}`,
    );
  }

  if (undocumentedAllowed.length > 0) {
    const details = undocumentedAllowed
      .sort((left, right) => left.table.localeCompare(right.table))
      .map(({ table, tier, reason }) => `${table} (${tier}) -> ${reason}`)
      .join('\n');

    fail(`Allowed platform_users reference tier lacks documentation:\n${details}`);
  }

  for (const table of priorLeakClassTables) {
    const descriptor = descriptors.get(table);
    const reasons = userRefReasonsByTable.get(table);

    if (!descriptor) {
      fail(`Prior leak-class table ${table} is missing from descriptors`);
    }

    if (descriptor.tier !== 'SCOPED') {
      fail(`Prior leak-class table ${table} must remain SCOPED, got ${descriptor.tier}`);
    }

    if (!reasons || reasons.size === 0) {
      fail(`Prior leak-class table ${table} is no longer covered by FK/soft-ref artifacts`);
    }
  }

  return {
    userReferenceTables: userRefReasonsByTable.size,
    scoped: Array.from(userRefReasonsByTable.keys()).filter(
      (table) => descriptors.get(table)?.tier === 'SCOPED',
    ).length,
    bootstrap: Array.from(userRefReasonsByTable.keys()).filter(
      (table) => descriptors.get(table)?.tier === 'BOOTSTRAP',
    ).length,
    legacy: Array.from(userRefReasonsByTable.keys()).filter(
      (table) => descriptors.get(table)?.tier === 'LEGACY',
    ).length,
  };
}

function cloneDescriptorsWithTierOverride({ table, tier }) {
  const descriptors = new Map();

  for (const [key, descriptor] of buildRlsDescriptors().entries()) {
    descriptors.set(key, key === table ? { ...descriptor, tier } : { ...descriptor });
  }

  return descriptors;
}

function expectFailure(label, descriptors, pattern) {
  try {
    assertP0102UserReferenceTierGuard({ descriptors });
  } catch (error) {
    if (!pattern.test(error.message)) {
      fail(`P0.10.2 self-test ${label} failed with unexpected message: ${error.message}`);
    }

    return;
  }

  fail(`P0.10.2 self-test ${label} unexpectedly passed`);
}

function runSelfTest() {
  expectFailure(
    'prior leak as INFRA',
    cloneDescriptorsWithTierOverride({ table: 'public.admin_audit_log', tier: 'INFRA' }),
    /Unsupported platform_users reference tier/,
  );

  expectFailure(
    'prior leak as TELEMETRY',
    cloneDescriptorsWithTierOverride({ table: 'public.broadcast_audit', tier: 'TELEMETRY' }),
    /Unsupported platform_users reference tier/,
  );

  expectFailure(
    'prior leak no longer SCOPED',
    cloneDescriptorsWithTierOverride({
      table: 'public.content_section_slug_history',
      tier: 'BOOTSTRAP',
    }),
    /must remain SCOPED/,
  );

  console.log('P0.10.2 user-reference tier guard self-test OK.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const summary = assertP0102UserReferenceTierGuard();

  console.log(
    `P0.10.2 user-reference tier guard OK: ${summary.userReferenceTables} tables with FK/soft-ref to platform_users; SCOPED=${summary.scoped}, BOOTSTRAP=${summary.bootstrap}, LEGACY=${summary.legacy}; INFRA/TELEMETRY=0.`,
  );
}
