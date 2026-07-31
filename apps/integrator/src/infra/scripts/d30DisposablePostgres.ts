/**
 * D30 Ш0 — throwaway PostgreSQL 16 server for concurrency proofs (advisory lock races, `FOR UPDATE
 * SKIP LOCKED` claim races). Same technique as `apps/webapp/scripts/check-c4a-843-clinic-invite-
 * concurrency.mjs` / `patient-invites-disposable-proof.mjs`: a fresh `initdb` data dir under `/tmp`,
 * unix-socket-only (`listen_addresses=''`), never touches an existing DATABASE_URL or a configured
 * app database.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const PG_BIN = '/usr/lib/postgresql/16/bin';
const SAFE_NAME_RE = /^bcb_integrator_[a-z0-9_]+_scratch_[a-z0-9_]+$/;

export type DisposablePostgres = {
  connectionString: string;
  stop: () => void;
};

/**
 * `pg_ctl start -w` daemonizes `postgres`, which — unless its stdout/stderr are redirected away
 * from a pipe — keeps inheriting and holding open whatever fds its parent gave it. `spawnSync`'s
 * default `stdio: 'pipe'` then never sees EOF (the long-running grandchild still holds the write
 * end) and hangs forever, even though `pg_ctl` itself already exited successfully. Redirecting to
 * a log file avoids the deadlock while still keeping diagnostics on failure.
 */
function run(command: string, args: string[], logFile: string): void {
  const fd = openSync(logFile, 'a');
  try {
    const result = spawnSync(command, args, { stdio: ['ignore', fd, fd] });
    if (result.error || result.status !== 0) {
      let detail = result.error?.message ?? 'unknown';
      try {
        detail = readFileSync(logFile, 'utf8').trim() || detail;
      } catch {
        /* best-effort diagnostics only */
      }
      throw new Error(`${path.basename(command)} failed: ${detail}`);
    }
  } finally {
    closeSync(fd);
  }
}

function safeRun(command: string, args: string[]): void {
  spawnSync(command, args, { stdio: 'ignore' });
}

export function startDisposablePostgres(label: string): DisposablePostgres {
  const stamp = `${process.pid}_${randomBytes(4).toString('hex')}`;
  const dbName = `bcb_integrator_${label}_scratch_${stamp}`;
  if (!SAFE_NAME_RE.test(dbName)) {
    throw new Error(`unsafe disposable db name: ${dbName}`);
  }

  const root = `/tmp/${dbName}_pg`;
  const data = path.join(root, 'data');
  const socket = path.join(root, 'socket');
  const port = String(56000 + (Number.parseInt(randomBytes(2).toString('hex'), 16) % 7000));

  mkdirSync(data, { recursive: true });
  mkdirSync(socket, { recursive: true });
  const setupLog = path.join(root, 'setup.log');
  run(
    path.join(PG_BIN, 'initdb'),
    ['-D', data, '-A', 'trust', '--no-locale', '-U', 'postgres'],
    setupLog,
  );
  run(
    path.join(PG_BIN, 'pg_ctl'),
    ['-D', data, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    setupLog,
  );
  run(path.join(PG_BIN, 'createdb'), ['-h', socket, '-p', port, '-U', 'postgres', dbName], setupLog);

  const connectionString = `postgresql://postgres@/${dbName}?host=${encodeURIComponent(socket)}&port=${port}`;

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    safeRun(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
    if (root.startsWith('/tmp/bcb_integrator_')) {
      rmSync(root, { recursive: true, force: true });
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stop();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }

  return { connectionString, stop };
}
