/**
 * Writes (or byte-checks) `deploy/postgres/privileges/drizzle-insert-surface.ts` — the machine-owned
 * artifact the privilege declaration reads as data.
 *
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-insert-surface.ts            # write
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-insert-surface.ts --check    # gate
 *
 * Why an artifact instead of a direct import: the privilege generator
 * (`deploy/postgres/privileges/generate.mjs`) is a plain Node module that deploy hosts run directly
 * (`deploy/host/deploy-test.sh`, `migrate-dev.sh`, `refresh-dev-from-test.sh`,
 * `cutover-postgres-port-context.sh`). It cannot import this workspace: `drizzle-orm` does not
 * resolve from the repository root, `db/schema/*.ts` uses extensionless intra-schema imports that
 * only a bundler resolver accepts, and `db/schema/operatorHealth.ts` needs a built
 * `packages/operator-db-schema`. Importing the schema there would make privilege generation depend
 * on an installed, built webapp workspace on the deploy host and would break the generator's
 * declared property — pure function, byte-identical output.
 *
 * So the workspace that owns Drizzle produces the metadata once, deterministically, and commits it.
 * `--check` is the gate that keeps it from drifting behind the schema: any schema change must
 * regenerate this artifact in the same code change.
 *
 * The artifact is DERIVED, never hand-edited — it carries no authority of its own. Both of its
 * sides are re-derived independently by the acceptance gate
 * `deploy/postgres/privileges/drizzle-insert-grant-completeness.test.mjs`, which compares them
 * against the grants the generator actually emits.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  REPO_ROOT,
  collectDirectInsertCallsites,
  collectDrizzleInsertSurface,
  type TableSurface,
} from './drizzle-insert-surface';

const ARTIFACT = path.join(REPO_ROOT, 'deploy/postgres/privileges/drizzle-insert-surface.ts');
const GENERATOR = 'apps/webapp/scripts/generate-drizzle-insert-surface.ts';

const HEADER = `/**
 * GENERATED — do not edit by hand.
 *
 * Produced by \`${GENERATOR}\`
 * from live Drizzle metadata plus an AST/import-graph scan of \`apps/webapp/src\`. Regenerate with:
 *
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-insert-surface.ts
 *
 * \`pnpm test:db-privileges\` runs the byte-equal \`--check\` first, so a schema change that does not
 * regenerate this file fails before any privilege test runs.
 *
 * WHAT EACH FIELD MEANS
 *   insertColumns          every column Drizzle NAMES in \`INSERT INTO <relation> (...)\` — the whole
 *                          schema column list minus columns whose \`generated.type !== 'byDefault'\`
 *                          (\`generatedAlwaysAs\`, \`generatedAlwaysAsIdentity\`). Postgres demands
 *                          column-level INSERT privilege on every named column even where the
 *                          value is the \`DEFAULT\` keyword, so a \`defaultRandom()\` primary key
 *                          belongs here even though no callsite ever sets it.
 *   directInsertCallsites  every \`.insert(<export>)\` in \`apps/webapp/src\` bound to this relation,
 *                          resolved through the import graph. EMPTY means no proven direct Drizzle
 *                          insert: the declaration must NOT widen such a relation's grant from ORM
 *                          metadata — its column grant serves raw SQL or a SECURITY DEFINER body
 *                          that names its own columns.
 *
 * This artifact is data, not authority. It grants nothing by itself: \`declaration.ts\` widens only
 * the column-level INSERT of relations that have a callsite here AND a role with a webapp
 * \`purpose: 'relation'\` capability, and it never removes a declared column.
 */
`;

export interface DrizzleInsertRelation {
  insertColumns: string[];
  directInsertCallsites: string[];
}

function render(
  surface: Record<string, TableSurface>,
  callsites: Map<string, string[]>,
): string {
  const rows: Record<string, DrizzleInsertRelation> = {};
  for (const [table, info] of Object.entries(surface)) {
    rows[`${info.schema}.${table}`] = {
      insertColumns: info.named,
      directInsertCallsites: callsites.get(table) ?? [],
    };
  }
  const body = Object.keys(rows).sort().map((relation) => {
    const row = rows[relation];
    const columns = row.insertColumns.map((column) => `      '${column}',`).join('\n');
    const sites = row.directInsertCallsites.map((site) => `      '${site}',`).join('\n');
    return `  '${relation}': {\n`
      + `    insertColumns: [\n${columns}\n    ],\n`
      + (sites === ''
        ? '    directInsertCallsites: [],\n'
        : `    directInsertCallsites: [\n${sites}\n    ],\n`)
      + '  },';
  }).join('\n');
  return `${HEADER}
export interface DrizzleInsertRelation {
  readonly insertColumns: readonly string[];
  readonly directInsertCallsites: readonly string[];
}

export const DRIZZLE_INSERT_SURFACE: Readonly<Record<string, DrizzleInsertRelation>> = {
${body}
};
`;
}

async function main(): Promise<void> {
  const surface = await collectDrizzleInsertSurface();
  const { byTable, unresolved } = collectDirectInsertCallsites(surface);
  if (unresolved.length > 0) {
    throw new Error(
      'these `.insert(...)` arguments could not be resolved to a db/schema export; resolve them '
        + 'or the artifact would silently omit a reachable relation:\n'
        + unresolved.sort().join('\n'),
    );
  }
  const rendered = render(surface, byTable);
  if (process.argv.includes('--check')) {
    if (readFileSync(ARTIFACT, 'utf8') !== rendered) {
      throw new Error(
        `${path.relative(REPO_ROOT, ARTIFACT)} does not match live Drizzle metadata. Run\n`
          + '  pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-insert-surface.ts\n'
          + 'and commit the result in the same change as the schema edit.',
      );
    }
    process.stdout.write(
      `${path.relative(REPO_ROOT, ARTIFACT)}: byte-identical to live Drizzle metadata `
        + `(${Object.keys(surface).length} relations, ${byTable.size} with a direct .insert()).\n`,
    );
    return;
  }
  writeFileSync(ARTIFACT, rendered);
  process.stdout.write(
    `${path.relative(REPO_ROOT, ARTIFACT)}: written `
      + `(${Object.keys(surface).length} relations, ${byTable.size} with a direct .insert()).\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
