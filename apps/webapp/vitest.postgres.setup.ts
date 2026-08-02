/**
 * Per-file setup for the `postgres-integration` Vitest project (block Б1/Б1а/Б1б, #1081, round 2
 * fix).
 *
 * Clones a brand-new disposable database from the template built once in
 * `vitest.postgres.globalSetup.ts` and points `process.env.DATABASE_URL` at the clone.
 *
 * This work happens at MODULE TOP LEVEL (not inside `beforeAll`), and is the round-2 fix for a
 * critical audit finding: a test file that constructs `new pg.Pool({ connectionString:
 * process.env.DATABASE_URL })` inside a `describe()` body reads that env var at COLLECTION time,
 * which Vitest runs before any `beforeAll` hook ever executes. Doing the clone+assign here instead
 * works because Vitest fully imports every `setupFiles` entry -- including its top-level `await`s
 * -- before it imports the test file itself, so this module's top-level code is guaranteed to have
 * finished (env var already reassigned) by the time the test file's own top-level code runs.
 *
 * Defense in depth: before handing control to the test file, this opens a real connection to the
 * clone and asserts `current_database()` matches the disposable `pbt_` pattern. If a future change
 * anywhere in this chain lets an ambient `DATABASE_URL` (e.g. a developer's exported
 * `bcb_webapp_dev`) leak through instead of this clone, the run fails here -- before the test file's
 * own first query -- rather than silently reading/writing a shared database.
 */
import { afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

if (process.env.POSTGRES_INTEGRATION_LIST_ONLY !== '1') {
  const webappRoot = path.resolve(__dirname);
  const cliPath = path.join(webappRoot, 'scripts', 'postgres-integration', 'cli.ts');

  function runCli(args: string[]): string {
    const result = spawnSync('pnpm', ['exec', 'tsx', cliPath, ...args], {
      cwd: webappRoot,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(
        `[postgres-integration setup] ${args[0]} failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
    const lines = result.stdout.trim().split('\n');
    return lines[lines.length - 1] ?? '';
  }

  const templateName = process.env.POSTGRES_INTEGRATION_TEMPLATE_DB;
  if (!templateName) {
    throw new Error(
      'POSTGRES_INTEGRATION_TEMPLATE_DB is unset -- vitest.postgres.globalSetup.ts did not run or failed',
    );
  }

  const cloneName = `pbt_${randomBytes(5).toString('hex')}`;
  const connectionUrl = runCli(['clone', `--template=${templateName}`, `--name=${cloneName}`]);

  const guardPool = new pg.Pool({ connectionString: connectionUrl, max: 1 });
  try {
    const result = await guardPool.query<{ name: string }>('SELECT current_database() AS name');
    const name = result.rows[0]?.name ?? '';
    if (!/^pbt_[a-z0-9_]+$/.test(name)) {
      throw new Error(
        `postgres-integration setup: current_database()="${name}" is not a disposable pbt_ database -- refusing to hand this connection to the test file`,
      );
    }
  } finally {
    await guardPool.end();
  }

  process.env.DATABASE_URL = connectionUrl;

  // `afterAll` never fires for collection-only invocations (`vitest list`): Vitest still imports
  // this setup file (and runs its top-level clone above) to enumerate the test file's cases, but
  // hooks like `afterAll` only run for a real `vitest run`. Without a fallback, every `vitest list`
  // would silently leak a clone database that nothing ever drops. `process.on('exit')` covers both
  // paths (and a mid-file crash) with one idempotent `DROP DATABASE IF EXISTS`; `afterAll` still
  // does the prompt drop for the normal run case so clones do not pile up across a long test run.
  let dropped = false;
  function dropCloneOnce(): void {
    if (dropped) return;
    dropped = true;
    try {
      runCli(['drop', `--name=${cloneName}`]);
    } catch (error) {
      console.error(
        `[postgres-integration setup] failed to drop clone ${cloneName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  afterAll(() => {
    dropCloneOnce();
  });
  process.on('exit', dropCloneOnce);
}
