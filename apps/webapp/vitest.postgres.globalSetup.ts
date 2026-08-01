/**
 * globalSetup for the `postgres-integration` Vitest project (block Б1/Б1а/Б1б, #1081, round 2 fix).
 *
 * Runs ONCE per `pnpm run test:postgres` invocation, in the main Vitest process: starts a private
 * PostgreSQL cluster and builds exactly one template database from the a0-greenfield baseline plus
 * every migration not yet represented in it (see harness-lib.ts header). The cluster's coordinates
 * (socket dir, port, operator/owner role names, template name) are written to `process.env` here --
 * Vitest forks worker processes from THIS process, so every env var set before the fork is inherited
 * by every worker, which is how `vitest.postgres.setup.ts` (running per test file, in a worker) and
 * the `clone`/`drop` CLI subprocesses it spawns reach the SAME already-running cluster without
 * starting a second one.
 */
import {
  teardownCluster,
  resolvePgCtlBin,
  buildTemplateDatabase,
} from './scripts/postgres-integration/harness-lib';

export default async function setup(): Promise<() => Promise<void>> {
  if (process.env.POSTGRES_INTEGRATION_LIST_ONLY === '1') return async () => {};

  const built = await buildTemplateDatabase();

  process.env.POSTGRES_INTEGRATION_TEMPLATE_DB = built.templateName;
  process.env.POSTGRES_INTEGRATION_SCRATCH_ROOT = built.scratchRoot;
  process.env.POSTGRES_INTEGRATION_DATA_DIR = built.dataDir;
  process.env.POSTGRES_INTEGRATION_SOCKET_DIR = built.socketDir;
  process.env.POSTGRES_INTEGRATION_PORT = built.port;
  process.env.POSTGRES_INTEGRATION_OPERATOR_ROLE = built.operatorRole;
  process.env.POSTGRES_INTEGRATION_OWNER_ROLE = built.ownerRole;
  process.env.POSTGRES_INTEGRATION_OWNERSHIP_TOKEN = built.ownershipToken;

  return async () => {
    const pgCtlBin = await resolvePgCtlBin();
    teardownCluster(built, pgCtlBin);
  };
}
