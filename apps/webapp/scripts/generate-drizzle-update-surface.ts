/**
 * Writes (or byte-checks) `deploy/postgres/privileges/drizzle-update-surface.ts` — the machine-owned
 * artifact `declaration.ts` reads to fail closed on an undeclared UPDATE column (#1069 correction).
 *
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts            # write
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts --check    # gate
 *
 * Same reason as `generate-drizzle-insert-surface.ts` for committing an artifact instead of a
 * direct import: the privilege generator is a plain Node module that cannot import this workspace.
 *
 * The artifact is DERIVED, never hand-edited — it carries no authority of its own. `declaration.ts`
 * only compares against it and throws; it never widens a grant from this data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  REPO_ROOT,
  collectDirectUpdateCallsites,
  collectDrizzleUpdateColumnMap,
  type UpdateTableSurface,
} from './drizzle-update-surface';

const ARTIFACT = path.join(REPO_ROOT, 'deploy/postgres/privileges/drizzle-update-surface.ts');
const GENERATOR = 'apps/webapp/scripts/generate-drizzle-update-surface.ts';

const HEADER = `/**
 * GENERATED — do not edit by hand.
 *
 * Produced by \`${GENERATOR}\`
 * from live Drizzle metadata plus an AST scan of \`apps/webapp/src\`. Regenerate with:
 *
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts
 *
 * \`pnpm test:db-privileges\` runs the byte-equal \`--check\` first, so a schema/callsite change that
 * does not regenerate this file fails before any privilege test runs.
 *
 * WHAT EACH FIELD MEANS
 *   updateColumns          SQL columns a \`.update(<relation>).set({...})\` call literal in
 *                          \`apps/webapp/src\` proves it writes. This is a LEXICAL LOWER BOUND, not
 *                          an exhaustive one: a \`.set(patch)\` call whose argument is not a plain
 *                          object literal with static keys cannot be read this way and is instead
 *                          reflected as an entry in \`unresolvedUpdateCallsites\`, never silently
 *                          dropped.
 *   directUpdateCallsites  every resolved \`.update(...).set({...})\` in \`apps/webapp/src\` bound to
 *                          this relation.
 *
 * \`DRIZZLE_UPDATE_UNRESOLVED_CALLSITES\` (module-level, not per relation) lists every
 * \`.update(...).set(...)\` this scan could not fully resolve to a set of declared columns
 * (unresolved table, non-literal \`.set()\` argument, or a literal with a spread/computed/unknown
 * key) — never silently dropped.
 *
 * This artifact is data, not authority. \`declaration.ts\` compares its \`updateColumns\` against each
 * declared column-level UPDATE grant and throws on the first relation whose declared columns do not
 * already cover it — it never adds a column to a grant from this data. See \`declaration.ts\`
 * SECTION -1 for why merging two authorities during generation is exactly the class of bug closed.
 */
`;

export interface DrizzleUpdateRelation {
  updateColumns: string[];
  directUpdateCallsites: string[];
}

function render(
  surface: Record<string, UpdateTableSurface>,
  callsites: Map<string, { columns: Set<string>; where: string[] }>,
  unresolved: string[],
): string {
  const rows: Record<string, DrizzleUpdateRelation> = {};
  for (const [table, info] of Object.entries(surface)) {
    const relation = `${info.schema}.${table}`;
    const entry = callsites.get(table);
    rows[relation] = {
      updateColumns: entry ? [...entry.columns].sort() : [],
      directUpdateCallsites: entry ? entry.where : [],
    };
  }
  const body = Object.keys(rows).filter((relation) => {
    const row = rows[relation];
    return row.updateColumns.length > 0 || row.directUpdateCallsites.length > 0;
  }).sort().map((relation) => {
    const row = rows[relation];
    const columns = row.updateColumns.map((column) => `      '${column}',`).join('\n');
    const sites = row.directUpdateCallsites.map((site) => `      '${site}',`).join('\n');
    return `  '${relation}': {\n`
      + `    updateColumns: [\n${columns}\n    ],\n`
      + (sites === ''
        ? '    directUpdateCallsites: [],\n'
        : `    directUpdateCallsites: [\n${sites}\n    ],\n`)
      + '  },';
  }).join('\n');
  const globalUnresolvedBlock = unresolved.length === 0
    ? '[]'
    : `[\n${[...unresolved].sort().map((line) => `  '${line.replace(/'/g, "\\'")}',`).join('\n')}\n]`;
  return `${HEADER}
export interface DrizzleUpdateRelation {
  readonly updateColumns: readonly string[];
  readonly directUpdateCallsites: readonly string[];
}

/**
 * Callsites this scan could not resolve to a table+column set at all (unresolved \`.update()\`
 * target, or a \`.set()\` argument that is not a plain object literal). Not narrowed to a relation —
 * declared here so the artifact never silently drops what it could not prove.
 */
export const DRIZZLE_UPDATE_UNRESOLVED_CALLSITES: readonly string[] = ${globalUnresolvedBlock};

export const DRIZZLE_UPDATE_SURFACE: Readonly<Record<string, DrizzleUpdateRelation>> = {
${body}
};
`;
}

async function main(): Promise<void> {
  const surface = await collectDrizzleUpdateColumnMap();
  const { byTable, unresolved } = collectDirectUpdateCallsites(surface);
  const rendered = render(surface, byTable, unresolved);
  if (process.argv.includes('--check')) {
    if (readFileSync(ARTIFACT, 'utf8') !== rendered) {
      throw new Error(
        `${path.relative(REPO_ROOT, ARTIFACT)} does not match live Drizzle metadata. Run\n`
          + '  pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts\n'
          + 'and commit the result in the same change as the schema/callsite edit.',
      );
    }
    process.stdout.write(
      `${path.relative(REPO_ROOT, ARTIFACT)}: byte-identical to live Drizzle metadata `
        + `(${byTable.size} relations with a resolved direct .update().set(), `
        + `${unresolved.length} unresolved callsites).\n`,
    );
    return;
  }
  writeFileSync(ARTIFACT, rendered);
  process.stdout.write(
    `${path.relative(REPO_ROOT, ARTIFACT)}: written `
      + `(${byTable.size} relations with a resolved direct .update().set(), `
      + `${unresolved.length} unresolved callsites).\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
