#!/usr/bin/env node
/** Disposable-only schema normalization representing the externally completed legacy stage. */
import { declaration } from '../declaration.ts';

const dbName = process.argv[2];
const db = declaration.databases[dbName];
if (!db) throw new Error(`unknown declaration database '${dbName ?? ''}'`);
const q = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
for (const [identity, table] of Object.entries(db.tables).sort(([a], [b]) => a.localeCompare(b))) {
  if (table.disposition !== 'PENDING_REMOVAL' && table.disposition !== 'REMOVED') continue;
  const [schema, name] = identity.split('.');
  process.stdout.write(`DROP TABLE IF EXISTS ${q(schema)}.${q(name)} CASCADE;\n`);
}
for (const identity of Object.keys(declaration.portContext?.privateRelations ?? {}).sort()) {
  const [schema, name] = identity.split('.');
  process.stdout.write(`DROP TABLE IF EXISTS ${q(schema)}.${q(name)} CASCADE;\n`);
}
