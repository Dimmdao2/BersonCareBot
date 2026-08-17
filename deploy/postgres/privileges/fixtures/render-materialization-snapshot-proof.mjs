#!/usr/bin/env node
// Renders the three SQL inputs of reminder-materialization-snapshot.acceptance.sh from the
// repository's own sources, so the proof can never drift into testing a private copy:
//
//   declared-grants.sql  — exactly the relation surface the declaration grants the seam owner
//   current-body.sql     — the newest migration definition of the snapshot root (what ships)
//   whole-row-body.sql   — the same definition with the due-occurrence read widened back to a
//                          whole row, i.e. the historical shape that produced the live 42501
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { declaration } from '../declaration.ts';

const SIGNATURE = 'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)';
const NAME = 'app.read_patient_reminder_materialization_snapshot';

const outIndex = process.argv.indexOf('--out');
if (outIndex < 0 || !process.argv[outIndex + 1]) throw new Error('--out <dir> is required');
const outDir = process.argv[outIndex + 1];

const declared = declaration.portContext.functions[SIGNATURE];
if (!declared) throw new Error(`undeclared function ${SIGNATURE}`);

const quoted = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const grants = (declared.relationSurfaces ?? []).flatMap((surface) => {
  const [schema, table] = surface.relation.split('.');
  const columns = surface.columns.map(quoted).join(', ');
  return surface.operations.map(
    (operation) => `GRANT ${operation} (${columns}) ON TABLE ${quoted(schema)}.${quoted(table)} TO ${quoted(declared.owner)};`,
  );
});
if (grants.length === 0) throw new Error(`${SIGNATURE} declares no relation surface`);
writeFileSync(`${outDir}/declared-grants.sql`, `${grants.join('\n')}\n`);

const migrationsDir = new URL('../../../../apps/webapp/db/drizzle-migrations/', import.meta.url);
const definition = (source) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${NAME}(`);
  if (start < 0) return undefined;
  const end = source.indexOf('$function$;', start);
  if (end < 0) throw new Error('unterminated function definition');
  return source.slice(start, end + '$function$;'.length);
};

const definitions = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => definition(readFileSync(new URL(file, migrationsDir), 'utf8')))
  .filter((body) => body !== undefined);
if (definitions.length === 0) throw new Error(`no migration defines ${NAME}`);

const current = definitions.at(-1);
writeFileSync(`${outDir}/current-body.sql`, `${current}\n`);

// The historical shape is reconstructed from the shipped body rather than pinned to an old file:
// whatever the current read names, the fault injection replaces it with the whole row.
const narrowRead = current.match(/ {4}SELECT candidate\.[\s\S]*?\n {4}FROM integrator\.user_reminder_occurrences AS candidate/);
if (!narrowRead) throw new Error('the due-occurrence read is no longer recognizable in the shipped body');
const wholeRow = current.replace(
  narrowRead[0],
  '    SELECT candidate.*\n    FROM integrator.user_reminder_occurrences AS candidate',
);
if (wholeRow === current) throw new Error('fault injection did not change the shipped body');
writeFileSync(`${outDir}/whole-row-body.sql`, `${wholeRow}\n`);
