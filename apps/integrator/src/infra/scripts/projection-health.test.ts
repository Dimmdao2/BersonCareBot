import { describe, expect, it, vi } from 'vitest';
import { runProjectionHealthCli } from './projection-health.js';

function createWritableMock() {
  return { write: vi.fn() };
}

describe('projection health CLI', () => {
  it('prints the shared projection health snapshot and exits 0 when not degraded', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { status: 'pending', cnt: '2' },
          { status: 'processing', cnt: '1' },
          { status: 'cancelled', cnt: '4' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ next_try_at: '2026-03-19T10:00:00Z' }] })
      .mockResolvedValueOnce({
        rows: [
          { attempts_done: 0, cnt: '2' },
          { attempts_done: 1, cnt: '1' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ last_success: '2026-03-19T09:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
    const end = vi.fn().mockResolvedValue(undefined);
    const stdout = createWritableMock();
    const stderr = createWritableMock();

    const exitCode = await runProjectionHealthCli({
      env: { CUTOVER_ENV_FILE: '/tmp/bersoncarebot-missing-cutover.env', DATABASE_URL: 'postgres://example' },
      createPool: (connectionString) => {
        expect(connectionString).toBe('postgres://example');
        return { query, end };
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(end).toHaveBeenCalledTimes(1);
    expect(stderr.write).not.toHaveBeenCalled();
    const printed = JSON.parse(String(stdout.write.mock.calls[0]?.[0]));
    expect(printed).toEqual({
      pendingCount: 2,
      deadCount: 0,
      cancelledCount: 4,
      oldestPendingAt: '2026-03-19T10:00:00Z',
      processingCount: 1,
      retryDistribution: { 0: 2, 1: 1 },
      lastSuccessAt: '2026-03-19T09:00:00Z',
      retriesOverThreshold: 0,
    });
  });

  it('exits 1 when shared projection health degradation rules fail', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: 'dead', cnt: '1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
    const end = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runProjectionHealthCli({
      env: {
        CUTOVER_ENV_FILE: '/tmp/bersoncarebot-missing-cutover.env',
        INTEGRATOR_DATABASE_URL: 'postgres://integrator',
      },
      createPool: () => ({ query, end }),
      stdout: createWritableMock(),
      stderr: createWritableMock(),
    });

    expect(exitCode).toBe(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('exits 1 without creating a pool when database url is missing', async () => {
    const stderr = createWritableMock();
    const createPool = vi.fn();

    const exitCode = await runProjectionHealthCli({
      env: { CUTOVER_ENV_FILE: '/tmp/bersoncarebot-missing-cutover.env' },
      createPool,
      stdout: createWritableMock(),
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(createPool).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith('INTEGRATOR_DATABASE_URL or DATABASE_URL is not set\n');
  });
});
