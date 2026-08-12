import { describe, expect, it, vi } from 'vitest';
import {
  runProjectionHealthCli,
  type ProjectionHealthCliEnv,
} from './projection-health.js';

describe('projection-health CLI', () => {
  it('reads the live integrator port and keeps the deploy-gate exit semantics', async () => {
    const snapshot = {
      pendingCount: 1,
      deadCount: 0,
      cancelledCount: 4,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: { 0: 1 },
      lastSuccessAt: null,
      retriesOverThreshold: 0,
    };
    const fetchHealth = vi.fn(async () =>
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = await runProjectionHealthCli({
      env: { INTEGRATOR_API_URL: 'http://127.0.0.1:4200/' },
      fetch: fetchHealth,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(fetchHealth).toHaveBeenCalledWith('http://127.0.0.1:4200/health/projection', {
      headers: { accept: 'application/json' },
    });
    expect(stdout.write).toHaveBeenCalledWith(`${JSON.stringify(snapshot, null, 2)}\n`);
    expect(stderr.write).not.toHaveBeenCalled();
  });

  it('does not accept a database URL as an alternative route around the runtime port', async () => {
    const fetchHealth = vi.fn(async () => new Response('{}', { status: 503 }));
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    const env = { DATABASE_URL: 'postgres://admin.invalid/bypass' } as unknown as ProjectionHealthCliEnv;

    const exitCode = await runProjectionHealthCli({ env, fetch: fetchHealth, stdout, stderr });

    expect(exitCode).toBe(1);
    expect(fetchHealth).toHaveBeenCalledWith('http://127.0.0.1:3200/health/projection', {
      headers: { accept: 'application/json' },
    });
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith('projection health endpoint returned HTTP 503\n');
  });
});
