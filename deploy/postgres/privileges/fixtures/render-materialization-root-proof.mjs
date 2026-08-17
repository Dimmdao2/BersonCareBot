#!/usr/bin/env node
// Renders the SQL inputs of reminder-materialization-roots.acceptance.sh from the repository's own
// sources, so the proof can never drift into testing a private copy of either the grants or the body.
//
//   declared-grants.sql   — the union of the relation surfaces the declaration grants the seam owner
//                           for the delivery-target root, the commit root and the fingerprint they
//                           delegate to.  Rendered, never hand-written.
//   target-body.sql       — newest migration definition of app.read_patient_reminder_delivery_target_snapshot
//   commit-body.sql       — newest migration definition of app.commit_patient_reminder_materialization
//   fingerprint-body.sql  — newest migration definition of app.patient_reminder_materialization_fingerprint
//   target-star-body.sql  — target root with the patient read widened back to the historical whole row
//   commit-star-body.sql  — commit root with the occurrence read widened back to the historical whole row
//
// The two *-star bodies are the fault injection required by AGENTS.md §10a: they reinstate exactly the
// shape that produced the live 42501 on the third root, so a green run cannot mean "the assertion no
// longer looks at anything".
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { declaration } from '../declaration.ts';

const SIGNATURES = {
  target: 'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)',
  commit: 'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)',
  fingerprint: 'app.patient_reminder_materialization_fingerprint(text,text)',
};

const outIndex = process.argv.indexOf('--out');
if (outIndex < 0 || !process.argv[outIndex + 1]) throw new Error('--out <dir> is required');
const outDir = process.argv[outIndex + 1];

const quoted = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const grants = [];
for (const signature of Object.values(SIGNATURES)) {
  const declared = declaration.portContext.functions[signature];
  if (!declared) throw new Error(`undeclared function ${signature}`);
  for (const surface of declared.relationSurfaces ?? []) {
    const [schema, table] = surface.relation.split('.');
    const columns = surface.columns.map(quoted).join(', ');
    for (const operation of surface.operations) {
      grants.push(
        `GRANT ${operation} (${columns}) ON TABLE ${quoted(schema)}.${quoted(table)} TO ${quoted(declared.owner)};`,
      );
    }
  }
}
if (grants.length === 0) throw new Error('the three roots declare no relation surface');
writeFileSync(`${outDir}/declared-grants.sql`, `${grants.join('\n')}\n`);

const migrationsDir = new URL('../../../../apps/webapp/db/drizzle-migrations/', import.meta.url);
const sources = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'));

const newestDefinition = (name) => {
  const found = sources.flatMap((source) => {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
    if (start < 0) return [];
    const end = source.indexOf('$function$;', start);
    if (end < 0) throw new Error(`unterminated definition of ${name}`);
    return [source.slice(start, end + '$function$;'.length)];
  });
  if (found.length === 0) throw new Error(`no migration defines ${name}`);
  return found.at(-1);
};

const bodies = Object.fromEntries(
  Object.entries(SIGNATURES).map(([key, signature]) => [key, newestDefinition(signature.split('(')[0])]),
);
for (const [key, body] of Object.entries(bodies)) writeFileSync(`${outDir}/${key}-body.sql`, `${body}\n`);

// Fault injection.  Whatever the shipped bodies name today, the injection replaces the read with the
// whole row the seam owner is deliberately not allowed to see.
const widen = (body, narrowPattern, wholeRow, label) => {
  const match = body.match(narrowPattern);
  if (!match) throw new Error(`the ${label} read is no longer recognizable in the shipped body`);
  return body.replace(match[0], wholeRow);
};
writeFileSync(
  `${outDir}/target-star-body.sql`,
  `${widen(
    bodies.target,
    / {2}SELECT patient\.[\s\S]*?\n {2}FROM public\.platform_users AS patient/,
    '  SELECT patient.* INTO v_patient\n  FROM public.platform_users AS patient',
    'delivery-target patient',
  )}\n`,
);
writeFileSync(
  `${outDir}/commit-star-body.sql`,
  `${widen(
    bodies.commit,
    / {2}SELECT candidate\.[\s\S]*?\n {2}FROM integrator\.user_reminder_occurrences AS candidate/,
    '  SELECT candidate.* INTO v_existing\n  FROM integrator.user_reminder_occurrences AS candidate',
    'commit occurrence',
  )}\n`,
);
