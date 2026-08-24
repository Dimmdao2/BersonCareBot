import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

/**
 * Contract between two independently maintained artifacts: the webapp code that enters the DB as an
 * infra principal, and `deploy/postgres/privileges/declaration.ts`, which is the ONLY place a port
 * capability may be declared. Nothing else joins them — a route can be added to the cron template,
 * the operator-health registry and `WEBAPP_LOCKED_INFRA_CRON_SOURCES`, pass typecheck, lint,
 * `generate-cli --check` and `--gaps`, and still be unable to open a single database connection,
 * because `webappPortCapabilityForInfraSource` finds no relation capability carrying its source and
 * `capabilityFor` finds no capability carrying its named root.
 *
 * What breaks without this: the job runs on schedule and every tick fails at the first query, so the
 * journals it was built to prune grow forever. `app.context_nonce_ledger` alone took the TEST
 * database to 1.3 GB at ~630k rows/day before the manual cleanup recorded in
 * docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md. The declaration's own
 * comments record this exact failure twice before (`billing.saas_renewal.tick` and the operator
 * alert staff-push audience), each time discovered only after the job had silently done nothing.
 *
 * The oracle is the declaration, never the code under test: the test renders the real runtime
 * capability set with the real generator and asks the real resolution functions to resolve it.
 */

/** Anchored to this file, never to the working directory the runner happened to start in. */
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');

type RenderedCapability = {
  purpose: string;
  contextClass: string;
  functionIdentity?: string;
  runtimeSources?: readonly string[];
};

async function renderWebappCapabilities(): Promise<Record<string, RenderedCapability>> {
  const { renderPortContextRuntimeEnv } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'deploy/postgres/privileges/generate.mjs')).href
  );
  // The declaration composes repo-root-relative SaaS scope tables at import time, exactly as the
  // privilege generator CLI runs it. Restored immediately so no other test sees a moved cwd.
  const cwd = process.cwd();
  process.chdir(REPO_ROOT);
  let declarationModule: { declaration: unknown };
  try {
    declarationModule = await import(
      pathToFileURL(path.join(REPO_ROOT, 'deploy/postgres/privileges/declaration.ts')).href
    );
  } finally {
    process.chdir(cwd);
  }
  const { value } = renderPortContextRuntimeEnv(
    declarationModule.declaration,
    'dev',
    'bcb_webapp_dev',
    'webapp',
  );
  return JSON.parse(value);
}

it('gives every locked-infra cron source a declared relation capability to enter the database with', async () => {
  const capabilities = await renderWebappCapabilities();
  const { WEBAPP_LOCKED_INFRA_CRON_SOURCES } = await import('@bersoncare/db-principal');
  const { webappPortCapabilityForInfraSource } = await import('@/infra/db/portContextRuntime');

  const unresolvable = [...WEBAPP_LOCKED_INFRA_CRON_SOURCES].filter((source) => {
    try {
      webappPortCapabilityForInfraSource(source, capabilities as never);
      return false;
    } catch {
      return true;
    }
  });

  expect(unresolvable, 'locked-infra cron sources with no declared port capability').toEqual([]);
});

it('gives every named root the journal retention tick calls a declared service capability', async () => {
  const capabilities = await renderWebappCapabilities();

  const calledRoots: string[] = [];
  vi.doMock('@/infra/db/runWebappSql', () => ({
    getWebappSqlDb: () => ({}),
    runWebappNamedRoot: (_db: unknown, functionIdentity: string) => {
      calledRoots.push(functionIdentity);
      return Promise.resolve({ rows: [{ affected_count: 0 }] });
    },
  }));
  // Track D final cutover (#987), audit F5: the module no longer imports infra directly (clean
  // architecture) — the DB capability now arrives through `JournalRetentionPort`, implemented by the
  // real pg adapter. Exercising the real adapter here keeps the assertion exactly as strong: it still
  // walks the full real chain down to the mocked `runWebappNamedRoot` boundary, and now also proves
  // the DI wiring itself resolves.
  const { runDbJournalRetention } = await import('@/modules/db-retention/journalRetention');
  const { createPgJournalRetentionPort } = await import('@/infra/repos/pgJournalRetention');
  await runDbJournalRetention(createPgJournalRetentionPort(), { dryRun: true });
  vi.doUnmock('@/infra/db/runWebappSql');

  expect(calledRoots.length).toBeGreaterThan(0);

  // The infra principal enters with context class `service`; a root declared for any other class is
  // as unreachable for this tick as one that is not declared at all.
  const undeclared = [...new Set(calledRoots)].filter(
    (identity) =>
      Object.values(capabilities).filter(
        (descriptor) =>
          descriptor.functionIdentity === identity && descriptor.contextClass === 'service',
      ).length !== 1,
  );

  expect(undeclared, 'named roots the retention tick calls with no declared service capability').toEqual([]);
});
