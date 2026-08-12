#!/usr/bin/env node
/** Emits disposable-only bodies for declaration functions absent from a schema-only source. */
import { readFileSync } from 'node:fs';
import { declaration } from '../declaration.ts';

const dbName = process.argv[2];
if (!declaration.databases[dbName]) throw new Error(`unknown declaration database '${dbName ?? ''}'`);
const excludeAt = process.argv.indexOf('--exclude-names-defined-in');
const excludedNames = new Set();
if (excludeAt >= 0) {
  const sourcePath = process.argv[excludeAt + 1];
  if (!sourcePath) throw new Error('--exclude-names-defined-in requires a file');
  const source = readFileSync(sourcePath, 'utf8');
  for (const match of source.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(/giu)) {
    excludedNames.add(match[1].toLowerCase());
  }
  for (const match of source.matchAll(
    /ALTER\s+FUNCTION\s+([a-z_][a-z0-9_]*)\.[a-z_][a-z0-9_]*\s*\([^;]*?\)\s+RENAME\s+TO\s+([a-z_][a-z0-9_]*)/giu,
  )) {
    excludedNames.add(`${match[1]}.${match[2]}`.toLowerCase());
  }
}
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

for (const [signature, fn] of Object.entries(declaration.portContext.functions)
  .filter(([, entry]) => !entry.databases || entry.databases.includes(dbName))
  .filter(([signature]) => !excludedNames.has(signature.slice(0, signature.indexOf('(')).toLowerCase()))
  .sort(([a], [b]) => a.localeCompare(b))) {
  const ddl = `CREATE FUNCTION ${signature} RETURNS ${fn.returns} LANGUAGE plpgsql AS $fixture$ BEGIN RAISE EXCEPTION 'disposable declaration function shell'; END $fixture$`;
  process.stdout.write([
    'DO $create_fixture$',
    'BEGIN',
    `  IF pg_catalog.to_regprocedure(${literal(signature)}) IS NULL THEN`,
    `    EXECUTE ${literal(ddl)};`,
    '  END IF;',
    'END',
    '$create_fixture$;',
    '',
  ].join('\n'));
}
