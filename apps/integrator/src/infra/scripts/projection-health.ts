#!/usr/bin/env node
/**
 * Prints projection_outbox health for release gate and deploy checklists.
 * Reads the canonical integrator runtime endpoint; this CLI never receives DB credentials.
 *
 * Exit code: 0 when not degraded (no dead, retriesOverThreshold within bounds);
 * 1 otherwise. `cancelled` is reported explicitly and does not mark degraded.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  isProjectionHealthDegraded,
  type ProjectionHealthSnapshot,
} from '../db/repos/projectionHealthCore.js';

export type ProjectionHealthCliEnv = {
  INTEGRATOR_API_URL?: string;
  PORT?: string;
};

type ProjectionHealthCliWriter = {
  write(chunk: string): unknown;
};

export type ProjectionHealthCliDeps = {
  env?: ProjectionHealthCliEnv;
  fetch?: typeof globalThis.fetch;
  stdout?: ProjectionHealthCliWriter;
  stderr?: ProjectionHealthCliWriter;
};

const projectionHealthSnapshotSchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  deadCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  oldestPendingAt: z.string().nullable(),
  processingCount: z.number().int().nonnegative(),
  retryDistribution: z.record(z.string(), z.number().int().nonnegative()),
  lastSuccessAt: z.string().nullable(),
  retriesOverThreshold: z.number().int().nonnegative(),
});

function resolveProjectionHealthUrl(env: ProjectionHealthCliEnv): string {
  const configured = env.INTEGRATOR_API_URL?.trim();
  const baseUrl = configured || `http://127.0.0.1:${env.PORT?.trim() || '3200'}`;
  return `${baseUrl.replace(/\/+$/, '')}/health/projection`;
}

export async function runProjectionHealthCli(deps: ProjectionHealthCliDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const fetchHealth = deps.fetch ?? globalThis.fetch;
  const url = resolveProjectionHealthUrl(env);
  try {
    const response = await fetchHealth(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      stderr.write(`projection health endpoint returned HTTP ${response.status}\n`);
      return 1;
    }
    const parsed = projectionHealthSnapshotSchema.safeParse(await response.json());
    if (!parsed.success) {
      stderr.write('projection health endpoint returned an invalid payload\n');
      return 1;
    }
    const snapshot = parsed.data as ProjectionHealthSnapshot;
    stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return isProjectionHealthDegraded(snapshot) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown fetch failure';
    stderr.write(`projection health endpoint request failed: ${message}\n`);
    return 1;
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
