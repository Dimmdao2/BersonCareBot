#!/usr/bin/env node
/** Emits disposable-only bodies for declaration functions absent from a schema-only source. */
import { declaration } from '../declaration.ts';

const dbName = process.argv[2];
if (!declaration.databases[dbName]) throw new Error(`unknown declaration database '${dbName ?? ''}'`);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

for (const [signature, fn] of Object.entries(declaration.portContext.functions)
  .filter(([, entry]) => !entry.databases || entry.databases.includes(dbName))
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
