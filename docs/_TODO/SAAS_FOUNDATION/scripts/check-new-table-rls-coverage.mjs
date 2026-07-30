#!/usr/bin/env node
// CI guard: a public table carrying organization_id must be represented by the
// existing RLS descriptor model and its policy coverage. This deliberately
// composes P0.8 descriptors and the Phase 4 locked/force target set; it is not
// a second table taxonomy.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readActualBaseTables, sourceDirs } from './actual-schema-tables.mjs';
import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import { getPhase4LockedPolicyTargets } from './phase4-locked-policy-artifact.mjs';
import { postPhase4StrictPolicyExceptions } from './post-phase4-strict-policy-exceptions.mjs';

const repoRoot = process.cwd();
const cutoverSqlPath = 'deploy/postgres/phase4-force-rls-cutover.sql';

// This is not a parallel classification registry. It holds a public organization_id
// table deliberately outside the generic Phase 4 locked
// policy renderer, with the reason/policy evidence kept beside the guard.
const nonLockedPolicyExceptions = new Map([
  [
    'public.be_organization_members',
    {
      reason:
        'BOOTSTRAP identity-to-organization resolver is read before an organization context exists (R1 taxonomy).',
    },
  ],
  ...postPhase4StrictPolicyExceptions,
]);

function fail(message) {
  throw new Error(message);
}

function listSqlFiles(dir) {
  return readdirSync(join(repoRoot, dir))
    .filter((file) => file.endsWith('.sql') && !file.toLowerCase().includes('example'))
    .sort()
    .map((file) => join(repoRoot, dir, file));
}

function stripSqlLineComments(source) {
  return source
    .split('\n')
    .map((line) => line.slice(0, line.indexOf('--') === -1 ? line.length : line.indexOf('--')))
    .join('\n');
}

function tableNameFromSql(match) {
  return match[1].replaceAll('"', '').split('.').at(-1);
}

function readMigrationOrgColumns() {
  const orgTables = new Set();
  const files = [
    ...listSqlFiles(sourceDirs.webappLegacyMigrations),
    ...listSqlFiles(sourceDirs.webappMigrations),
  ];

  for (const file of files) {
    const source = stripSqlLineComments(readFileSync(file, 'utf8'));

    for (const match of source.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?public"?\.)?"?[a-zA-Z0-9_]+"?)[\s\S]*?;/gi,
    )) {
      if (/\borganization_id\b/i.test(match[0])) orgTables.add(tableNameFromSql(match));
    }

    for (const match of source.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:"?public"?\.)?"?[a-zA-Z0-9_]+"?)[\s\S]*?;/gi,
    )) {
      const table = tableNameFromSql(match);
      if (/ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?organization_id"?\b/i.test(match[0])) {
        orgTables.add(table);
      }
      if (/DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+"?organization_id"?\b/i.test(match[0])) {
        orgTables.delete(table);
      }
    }
  }

  return orgTables;
}

function findBalancedObject(source, start) {
  const open = source.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  return '';
}

function readSchemaOrgColumns() {
  const orgTables = new Set();
  const schemaDir = join(repoRoot, sourceDirs.webappSchema);

  for (const file of readdirSync(schemaDir)
    .filter((name) => name.endsWith('.ts'))
    .sort()) {
    const source = readFileSync(join(schemaDir, file), 'utf8');
    for (const match of source.matchAll(/pgTable\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)) {
      if (/\borganization_id\b/.test(findBalancedObject(source, match.index))) {
        orgTables.add(match[1]);
      }
    }
  }

  return orgTables;
}

function readForceTargets() {
  const targets = new Set();
  const source = readFileSync(join(repoRoot, cutoverSqlPath), 'utf8');
  for (const match of source.matchAll(/\('"(public|integrator)"\."([^"]+)"'\)/g)) {
    targets.add(`${match[1]}.${match[2]}`);
  }
  return targets;
}

export function readPublicOrgScopedTables() {
  const actualPublicTables = new Set(
    readActualBaseTables().filter((table) => table.startsWith('public.')),
  );
  const schemaOrgTables = readSchemaOrgColumns();
  const migrationOrgTables = readMigrationOrgColumns();

  return new Set(
    Array.from(actualPublicTables).filter((table) => {
      const name = table.slice('public.'.length);
      return schemaOrgTables.has(name) || migrationOrgTables.has(name);
    }),
  );
}

export function assertNewTableRlsCoverage({
  publicOrgTables = readPublicOrgScopedTables(),
  descriptors = buildRlsDescriptors(),
  lockedTargets = new Set(getPhase4LockedPolicyTargets().map(({ descriptor }) => descriptor.table)),
  forceTargets = readForceTargets(),
} = {}) {
  const missingDescriptor = [];
  const missingPolicy = [];

  for (const table of publicOrgTables) {
    const descriptor = descriptors.get(table);
    const exception = nonLockedPolicyExceptions.get(table);

    if (!descriptor && !exception) {
      missingDescriptor.push(table);
      continue;
    }

    // INFRA/TELEMETRY/LEGACY are explicit descriptor-model exemptions. The
    // P0.8 descriptor validator requires their documented source/reason, so
    // they are classification coverage rather than generic forced-wall rows.
    if (descriptor?.scopingKind === 'explicit_exemption' && descriptor.source) continue;

    if (lockedTargets.has(table) && forceTargets.has(table)) continue;

    if (!exception) {
      missingPolicy.push(table);
      continue;
    }
  }

  if (missingDescriptor.length > 0 || missingPolicy.length > 0) {
    const details = [
      missingDescriptor.length > 0
        ? `missing RLS descriptor/classification: ${missingDescriptor.sort().join(', ')}`
        : '',
      missingPolicy.length > 0
        ? `missing locked/forced RLS policy coverage: ${missingPolicy.sort().join(', ')}`
        : '',
    ].filter(Boolean);
    fail(
      `NEW public organization_id table lacks RLS coverage; ${details.join('; ')}. Add it to the existing descriptor/policy model, or add a documented explicit exception with a reason.`,
    );
  }

  return publicOrgTables.size;
}

function runSelfTest() {
  const tables = readPublicOrgScopedTables();
  const fakeTable = 'public.self_test_missing_org_descriptor';
  try {
    assertNewTableRlsCoverage({ publicOrgTables: new Set([...tables, fakeTable]) });
  } catch (error) {
    if (!String(error).includes(fakeTable)) throw error;
    console.log('check-new-table-rls-coverage self-test: missing descriptor detection OK');
  }

  const descriptors = buildRlsDescriptors();
  descriptors.set(fakeTable, {
    table: fakeTable,
    tier: 'SCOPED',
    scopingKind: 'direct_org_column',
  });
  try {
    assertNewTableRlsCoverage({ publicOrgTables: new Set([...tables, fakeTable]), descriptors });
  } catch (error) {
    if (!String(error).includes('missing locked/forced RLS policy coverage')) throw error;
    console.log('check-new-table-rls-coverage self-test: missing policy detection OK');
    return;
  }

  fail('self-test did not detect missing locked/forced policy coverage');
}

try {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else {
    assertNewTableRlsCoverage();
    console.log('check-new-table-rls-coverage: active public organization tables are covered');
  }
} catch (error) {
  console.error(
    `check-new-table-rls-coverage: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
