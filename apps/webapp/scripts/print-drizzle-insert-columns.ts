/**
 * Test-only helper. Prints, as JSON on stdout, the column list Drizzle actually NAMES in
 * `INSERT INTO <table> (...)` for every `pgTable` exported from `db/schema/*.ts`.
 *
 * Why it exists: the privilege declaration lives outside this workspace
 * (`deploy/postgres/privileges/`) and cannot import Drizzle metadata directly, but the
 * column-level `INSERT` grant it emits has to cover every column Drizzle names. The gate
 * `deploy/postgres/privileges/drizzle-insert-grant-completeness.test.mjs` spawns this file
 * through `node_modules/.bin/tsx` and joins the output with the declaration.
 *
 * The derivation itself — and why `defaultRandom()` primary keys are named while
 * `generatedAlwaysAs` columns are not — lives in `./drizzle-insert-surface.ts`.
 *
 * Output: { [sqlTableName]: { exports: [{ exportName, module }], schema: string,
 *                            named: string[], generatedAlways: string[] } }
 */
import { collectDrizzleInsertSurface } from './drizzle-insert-surface';

collectDrizzleInsertSurface().then(
  (surface) => {
    process.stdout.write(JSON.stringify(surface));
  },
  (error: unknown) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  },
);
