/**
 * Regression coverage for the two destructive-lifecycle findings from the Б1 blind audit.
 * The command adapter is a normal `stopCluster` dependency; no environment-only fault hook exists.
 */
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildTemplateDatabase,
  resolvePgCtlBin,
  teardownCluster,
  type PgCtlCommandRunner,
} from '../../../scripts/postgres-integration/harness-lib';

it('rejects an env-shaped foreign root and preserves an own root when pg_ctl stop fails', async () => {
  const cluster = await buildTemplateDatabase();
  const pgCtlBin = await resolvePgCtlBin();
  const decoyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt_cluster_decoy_'));
  let stopped = false;

  try {
    const decoyDataDir = path.join(decoyRoot, 'data');
    const sentinelPath = path.join(decoyRoot, 'sentinel');
    fs.chmodSync(decoyRoot, 0o700);
    fs.mkdirSync(decoyDataDir, { mode: 0o700 });
    fs.writeFileSync(sentinelPath, 'foreign invocation');

    expect(() =>
      teardownCluster(
        { ...cluster, scratchRoot: decoyRoot, dataDir: decoyDataDir },
        pgCtlBin,
      ),
    ).toThrow('unowned_postgres_integration_cluster');
    expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('foreign invocation');

    const failStop: PgCtlCommandRunner = (command, args) => {
      if (args.at(-1) === 'stop') return { status: 1, signal: null };
      const result = spawnSync(command, args, { stdio: 'ignore' });
      return { error: result.error, status: result.status, signal: result.signal };
    };
    expect(() => teardownCluster(cluster, pgCtlBin, { runPgCtl: failStop })).toThrow(
      'pg_ctl stop failed with status 1',
    );
    expect(fs.existsSync(cluster.scratchRoot)).toBe(true);

    const status = spawnSync(pgCtlBin, ['-D', cluster.dataDir, 'status'], { stdio: 'ignore' });
    expect(status.status).toBe(0);

    teardownCluster(cluster, pgCtlBin);
    stopped = true;
    expect(fs.existsSync(cluster.scratchRoot)).toBe(false);
    expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('foreign invocation');
  } finally {
    if (!stopped && fs.existsSync(cluster.scratchRoot)) teardownCluster(cluster, pgCtlBin);
    fs.rmSync(decoyRoot, { recursive: true, force: true });
  }
});
