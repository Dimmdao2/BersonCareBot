#!/usr/bin/env tsx
/**
 * CLI for the disposable-PostgreSQL harness (block Б1/Б1а/Б1б, #1081, round 2 fix). Thin argv
 * dispatch over ./harness-lib.ts -- see that file's header for the "why".
 *
 * Usage:
 *   tsx scripts/postgres-integration/cli.ts build-template
 *   tsx scripts/postgres-integration/cli.ts clone --template=<name> --name=<name>
 *   tsx scripts/postgres-integration/cli.ts drop --name=<name>
 *   tsx scripts/postgres-integration/cli.ts list
 *   tsx scripts/postgres-integration/cli.ts teardown
 *   tsx scripts/postgres-integration/cli.ts self-test
 *
 * `build-template` starts the private cluster (own data dir, own Unix socket, no TCP) and prints a
 * single-line JSON object as the LAST line of stdout: the cluster coordinates every other command
 * needs, plus the built template's name. `vitest.postgres.globalSetup.ts` exports this JSON's
 * fields as env vars so per-file `clone`/`drop` subprocesses (spawned by `vitest.postgres.setup.ts`
 * for every test file) can reach the SAME already-running cluster instead of starting a new one.
 * `clone` prints the clone's connection URL as the LAST line of stdout. `teardown` stops the whole
 * private cluster and removes its data directory in one step -- see harness-lib.ts's
 * `teardownCluster` header for why it does not try to drop individual databases/roles first.
 */
import {
  buildTemplateDatabase,
  cloneFromTemplate,
  clusterFromEnv,
  dropDisposableDatabase,
  listDatabases,
  newCloneName,
  resolvePgCtlBin,
  resolvePsqlBin,
  selfTest,
  teardownCluster,
} from './harness-lib';

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'self-test') {
    await selfTest();
    return;
  }

  if (command === 'build-template') {
    const built = await buildTemplateDatabase();
    console.log(
      JSON.stringify({
        templateName: built.templateName,
        scratchRoot: built.scratchRoot,
        dataDir: built.dataDir,
        socketDir: built.socketDir,
        port: built.port,
        operatorRole: built.operatorRole,
        ownerRole: built.ownerRole,
      }),
    );
    return;
  }

  if (command === 'clone') {
    const cluster = clusterFromEnv();
    const psqlBin = await resolvePsqlBin();
    const template = flag(rest, 'template');
    if (!template) throw new Error('clone requires --template=<name>');
    const name = flag(rest, 'name') ?? newCloneName('clone');
    const { connectionUrl } = cloneFromTemplate(cluster, psqlBin, template, name);
    console.log(connectionUrl);
    return;
  }

  if (command === 'drop') {
    const cluster = clusterFromEnv();
    const psqlBin = await resolvePsqlBin();
    const name = flag(rest, 'name');
    if (!name) throw new Error('drop requires --name=<name>');
    dropDisposableDatabase(cluster, psqlBin, name);
    return;
  }

  if (command === 'list') {
    const cluster = clusterFromEnv();
    const psqlBin = await resolvePsqlBin();
    for (const name of listDatabases(cluster, psqlBin)) console.log(name);
    return;
  }

  if (command === 'teardown') {
    const cluster = clusterFromEnv();
    const pgCtlBin = await resolvePgCtlBin();
    teardownCluster(cluster, pgCtlBin);
    return;
  }

  throw new Error(
    `unknown command: ${command ?? '<none>'} (expected build-template | clone | drop | list | teardown | self-test)`,
  );
}

main().catch((error) => {
  console.error(
    `[postgres-integration-harness] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
