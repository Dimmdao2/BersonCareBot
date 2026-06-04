#!/usr/bin/env node
/**
 * Prints projection_outbox health for release gate and deploy checklists.
 * Uses INTEGRATOR_DATABASE_URL when set (gate from monorepo root), then
 * SOURCE_DATABASE_URL, then DATABASE_URL.
 *
 * Exit code: 0 when not degraded (no dead, retriesOverThreshold within bounds);
 * 1 otherwise. `cancelled` is reported explicitly and does not mark degraded.
 */
import 'dotenv/config';
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProjectionHealthDegraded,
  readProjectionHealthSnapshot,
  type ProjectionHealthQueryable,
} from '../db/repos/projectionHealthCore.js';

const { Pool } = pg;

type ProjectionHealthPool = ProjectionHealthQueryable & {
  end(): Promise<void>;
};

type ProjectionHealthCliEnv = {
  INTEGRATOR_DATABASE_URL?: string;
  SOURCE_DATABASE_URL?: string;
  DATABASE_URL?: string;
  CUTOVER_ENV_FILE?: string;
};

type ProjectionHealthCliWriter = {
  write(chunk: string): unknown;
};

export type ProjectionHealthCliDeps = {
  env?: ProjectionHealthCliEnv;
  createPool?: (connectionString: string) => ProjectionHealthPool;
  stdout?: ProjectionHealthCliWriter;
  stderr?: ProjectionHealthCliWriter;
};

type LoadedEnv = {
  loaded: boolean;
  path: string | null;
};

function resolveRepoRootFromThisFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', '..', '..');
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadProjectionHealthCutoverEnv(env: ProjectionHealthCliEnv = process.env): LoadedEnv {
  const repoRoot = resolveRepoRootFromThisFile();
  const explicitPath = env.CUTOVER_ENV_FILE;
  const candidates = explicitPath
    ? [explicitPath]
    : [
        '/opt/env/bersoncarebot/cutover.prod',
        path.join(repoRoot, '.env.cutover.dev'),
        path.join(repoRoot, '.env.cutover'),
      ];
  const resolvedPath = candidates.find((candidate) => candidate && existsSync(candidate)) ?? candidates[0] ?? null;
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { loaded: false, path: resolvedPath };
  }

  const parsed = parseEnvFile(readFileSync(resolvedPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key as keyof ProjectionHealthCliEnv] == null || env[key as keyof ProjectionHealthCliEnv] === '') {
      env[key as keyof ProjectionHealthCliEnv] = value;
    }
  }
  return { loaded: true, path: resolvedPath };
}

function resolveDatabaseUrl(env: ProjectionHealthCliEnv): string | null {
  return env.INTEGRATOR_DATABASE_URL || env.SOURCE_DATABASE_URL || env.DATABASE_URL || null;
}

export async function runProjectionHealthCli(deps: ProjectionHealthCliDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  loadProjectionHealthCutoverEnv(env);

  const url = resolveDatabaseUrl(env);
  if (!url || !url.trim()) {
    stderr.write('INTEGRATOR_DATABASE_URL or DATABASE_URL is not set\n');
    return 1;
  }

  const createPool =
    deps.createPool ??
    ((connectionString: string): ProjectionHealthPool => new Pool({ connectionString }));
  const pool = createPool(url);
  try {
    const snapshot = await readProjectionHealthSnapshot(pool);
    stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return isProjectionHealthDegraded(snapshot) ? 1 : 0;
  } finally {
    await pool.end();
  }
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) return false;
  const entryPath = fileURLToPath(import.meta.url);
  return (
    process.argv[1] === entryPath ||
    process.argv[1].endsWith('/projection-health.ts') ||
    process.argv[1].endsWith('/projection-health.js')
  );
}

if (isMainModule()) {
  runProjectionHealthCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
