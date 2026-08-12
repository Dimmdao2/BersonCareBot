#!/usr/bin/env node
/**
 * Production relation-use census for the privilege declaration.
 * Tests, migrations, scripts and documentation are intentionally excluded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const productionRoots = [
  'apps/webapp/src',
  'apps/integrator/src',
  'apps/media-worker/src',
  'packages',
].map((root) => path.join(repoRoot, root));
const schemaRoots = [
  path.join(repoRoot, 'apps/webapp/db/schema'),
  path.join(repoRoot, 'apps/integrator/src/infra/db/schema'),
];
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const testFile = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test(?:\/|$))/;

function walk(directory, accept) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(target, accept));
    else if (accept(target)) found.push(target);
  }
  return found;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineHits(file, pattern) {
  const hits = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) hits.push(index + 1);
    pattern.lastIndex = 0;
  }
  return hits;
}

function relationSymbols() {
  const symbols = new Map();
  const schemaFiles = schemaRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file)));
  for (const file of schemaFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:pgTable|pgSchema\([^)]*\)\.)?(?:table|pgTable)\s*\(\s*['"]([^'"]+)['"]/g)) {
      const [, symbol, table] = match;
      const schema = file.includes('/apps/integrator/') ? 'integrator' : 'public';
      const identity = `${schema}.${table}`;
      const current = symbols.get(identity) ?? new Set();
      current.add(symbol);
      symbols.set(identity, current);
    }
  }
  return symbols;
}

export function productionRelationHits(identities) {
  const files = productionRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file) && !testFile.test(file)));
  const symbols = relationSymbols();
  const rows = new Map();
  for (const identity of identities) {
    const [, table] = identity.split('.');
    const names = [identity, table, ...(symbols.get(identity) ?? [])];
    const pattern = new RegExp(`\\b(?:${names.map(escapeRegex).join('|')})\\b`);
    const hits = [];
    for (const file of files) {
      const lines = lineHits(file, pattern);
      if (lines.length) hits.push(`${path.relative(repoRoot, file)}:${lines.slice(0, 6).join(',')}`);
    }
    rows.set(identity, hits);
  }
  return rows;
}

export function assertNoUndeclaredRuntimeSurface(declaration, dbName) {
  const database = declaration.databases[dbName];
  if (!database) throw new Error(`undeclared database '${dbName}'`);
  const active = Object.entries(database.tables).filter(([, table]) => table.disposition === 'ACTIVE');
  const hits = productionRelationHits(active.map(([identity]) => identity));
  const failures = [];
  for (const [identity, table] of active) {
    const access = table.access;
    const paths = hits.get(identity) ?? [];
    if (access?.kind === 'no-runtime-surface' && paths.length > 0) {
      failures.push(`no-runtime-surface has production callsite ${identity}: ${paths.join(' ')}`);
    }
    if (access?.kind === 'direct') {
      if (access.codePaths.length === 0 || paths.length === 0) {
        failures.push(`direct access lacks production relation callsite ${identity}`);
      }
      const expected = new Map(access.grants.map((grant) => [grant.role, grant]));
      const seamOwners = new Set(access.seams.map((seam) => seam.owner));
      for (const [role, grant] of Object.entries(table.grants ?? {})) {
        const wanted = expected.get(role);
        if (!wanted) {
          if (!seamOwners.has(role)) failures.push(`direct access grant role is absent from direct/seam matrix ${identity}:${role}`);
          continue;
        }
        const matches = wanted.operations.every((operation) => (grant.privs ?? []).some((actual) => {
          if (wanted.columns === 'table') return actual === operation;
          return typeof actual === 'object' && actual.kind === 'columns' && actual.priv === operation
            && actual.columns.length === wanted.columns.length
            && actual.columns.every((column) => wanted.columns.includes(column));
        }));
        if (!matches) {
          failures.push(`direct access grant is not declared by the exact matrix ${identity}:${role}`);
        }
      }
      for (const role of expected.keys()) {
        if (!(role in (table.grants ?? {}))) failures.push(`direct access role lacks relation grant ${identity}:${role}`);
      }
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {
    files: productionRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file) && !testFile.test(file))).length,
    hits,
  };
}

function main() {
  const relation = process.argv[2];
  if (!relation) throw new Error('usage: node access-census.mjs <schema.relation> [...]');
  const hits = productionRelationHits(process.argv.slice(2));
  for (const [identity, paths] of hits) {
    console.log(`${identity}\t${paths.length === 0 ? 'NO_RUNTIME_CALLSITE' : paths.join(' ')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
