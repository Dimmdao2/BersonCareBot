/**
 * Behavioural regression test for the reconcile-dev-patient-reminder-orphans CLI wiring.
 *
 * Forensic finding: `--execute` reads/writes through `db.tx(...)` → `getIntegratorDrizzleSession(tx)`,
 * which installs the organization principal at the database-session level. The dry-run path used to
 * call `getIntegratorDrizzleSession(db)` on the plain (non-transactional) pool instead — no principal
 * installed, so the privilege walls would reject the very SELECT dry-run exists to preview.
 *
 * This test does not touch a real database. It fakes the DB port at the exact seam the script uses
 * (`createDbPort`, `getIntegratorDrizzleSession`, `runWithOrganizationPrincipal`) and proves, by
 * OBSERED BEHAVIOUR (not by reading the script's source text):
 *   - dry-run reads through the same `db.tx(...)` transaction wrapper as `--execute`;
 *   - a read issued OUTSIDE that wrapper (the old broken path) is rejected, exactly mirroring the
 *     real privilege-wall rejection described in the forensic note;
 *   - dry-run never calls the write (disable) path;
 *   - both modes run their query while the organization principal is "installed" (our fake tracks
 *     install/uninstall around `runWithOrganizationPrincipal`).
 *
 * The module under test runs its `main()` immediately on import (it is a one-shot CLI script), so
 * each scenario resets the module registry and dynamically re-imports it with fresh mocks/argv.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = string;

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  candidateRows: [
    { id: 'wp-122c3af1-b81f-4602-b2e4-5bb34d84f0eb' },
    { id: 'wp-78d3c36d-a390-4dbc-88ea-3b94d6f2f038' },
  ],
  principalDepth: 0,
  onDone: null as null | (() => void),
}));

function fakeReadWriteSession(tag: 'raw' | 'tx') {
  return {
    select: () => ({
      from: () => ({
        where: () => {
          state.calls.push(`select:${tag}:principal=${state.principalDepth > 0}`);
          if (tag === 'raw') {
            // Mirrors the real privilege-wall rejection: no principal installed outside a tx.
            return Promise.reject(new Error('reconcile_test_privilege_wall_rejected'));
          }
          return Promise.resolve(state.candidateRows);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => {
            state.calls.push(`update:${tag}:principal=${state.principalDepth > 0}`);
            return Promise.resolve(state.candidateRows);
          },
        }),
      }),
    }),
  };
}

vi.mock('../../config/env.js', () => ({
  env: {
    DB_PRINCIPAL_CONTEXT_MODE: 'legacy-guc',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/bcb_webapp_dev',
    INTEGRATOR_DB_URL: '',
  },
}));

vi.mock('../db/client.js', () => ({
  createDbPort: () => ({
    __session: fakeReadWriteSession('raw'),
    tx: (work: (tx: unknown) => unknown) => {
      state.calls.push('tx:start');
      const txPort = { __session: fakeReadWriteSession('tx') };
      return Promise.resolve(work(txPort)).finally(() => state.calls.push('tx:end'));
    },
  }),
  closeDb: () => {
    state.calls.push('closeDb');
    state.onDone?.();
  },
}));

vi.mock('../db/drizzle.js', () => ({
  getIntegratorDrizzleSession: (port: { __session: unknown }) => port.__session,
}));

vi.mock('../principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: async <T>(organizationId: string, fn: () => Promise<T> | T) => {
    state.calls.push(`principal:start:${organizationId}`);
    state.principalDepth += 1;
    try {
      return await fn();
    } finally {
      state.principalDepth -= 1;
      state.calls.push('principal:end');
    }
  },
}));

const originalArgv = process.argv;

async function runScript(args: string[]): Promise<{ logs: unknown[]; errors: unknown[] }> {
  state.calls.length = 0;
  process.argv = ['node', 'reconcile-dev-patient-reminder-orphans.js', ...args];
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.exitCode = undefined;

  const finished = new Promise<void>((resolve) => {
    state.onDone = resolve;
  });
  vi.resetModules();
  await import('./reconcile-dev-patient-reminder-orphans.js');
  await finished;

  const logs = logSpy.mock.calls.map((call) => call[0]);
  const errors = errorSpy.mock.calls.map((call) => call[0]);
  logSpy.mockRestore();
  errorSpy.mockRestore();
  return { logs, errors };
}

describe('reconcile-dev-patient-reminder-orphans: dry-run/--execute port symmetry', () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.principalDepth = 0;
    state.onDone = null;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
  });

  it('dry-run reads through the same db.tx(...) transaction as --execute, with the principal installed, and performs no write', async () => {
    const { logs, errors } = await runScript([]);

    expect(errors).toEqual([]);
    expect(process.exitCode).toBeUndefined();

    // Went through db.tx(...), not the raw pool.
    expect(state.calls).toContain('tx:start');
    expect(state.calls).toContain('tx:end');
    expect(state.calls.some((c) => c.startsWith('select:tx:principal=true'))).toBe(true);
    // Never touched the raw (non-transactional) session.
    expect(state.calls.some((c) => c.startsWith('select:raw'))).toBe(false);
    // No write happened in dry-run.
    expect(state.calls.some((c) => c.startsWith('update:'))).toBe(false);

    const payload = JSON.parse(logs[0] as string);
    expect(payload.mode).toBe('dry-run');
    expect(payload.candidates).toEqual(state.candidateRows);
  });

  it('--execute reads and writes through db.tx(...) with the principal installed', async () => {
    const { logs, errors } = await runScript(['--execute']);

    expect(errors).toEqual([]);
    expect(process.exitCode).toBeUndefined();

    expect(state.calls.some((c) => c.startsWith('select:tx:principal=true'))).toBe(true);
    expect(state.calls.some((c) => c.startsWith('update:tx:principal=true'))).toBe(true);
    expect(state.calls.some((c) => c.startsWith('select:raw'))).toBe(false);

    const payload = JSON.parse(logs[0] as string);
    expect(payload.mode).toBe('execute');
    expect(payload.candidates).toEqual(state.candidateRows);
    expect(payload.reconciled).toEqual(state.candidateRows);
  });
});
