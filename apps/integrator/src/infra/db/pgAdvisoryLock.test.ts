import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from './drizzleSqlDebugText.js';

const execute = vi.fn();

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ execute })),
}));

import {
  pgSessionAdvisoryLock,
  pgSessionAdvisoryUnlock,
  pgTrySessionAdvisoryLock,
  RUBITIME_API_ADVISORY_LOCK_KEY,
} from './pgAdvisoryLock.js';

describe('pgAdvisoryLock (integrator)', () => {
  beforeEach(() => {
    execute.mockClear();
    execute.mockResolvedValue({ rows: [] });
  });

  it('exports stable Rubitime advisory int key', () => {
    expect(RUBITIME_API_ADVISORY_LOCK_KEY).toBe(58220114);
  });

  it('pgSessionAdvisoryLock issues pg_advisory_lock with int param', async () => {
    const client = {} as never;
    await pgSessionAdvisoryLock(client, 58220114);
    const text = drizzleSqlFragmentToApproximateSql(execute.mock.calls[0]?.[0]);
    expect(text).toContain('pg_advisory_lock');
    expect(text).not.toContain('xact');
  });

  it('pgSessionAdvisoryUnlock issues pg_advisory_unlock', async () => {
    await pgSessionAdvisoryUnlock({} as never, 42001001);
    const text = drizzleSqlFragmentToApproximateSql(execute.mock.calls.at(-1)?.[0]);
    expect(text).toContain('pg_advisory_unlock');
  });

  it('pgTrySessionAdvisoryLock reads locked from execute rows', async () => {
    execute.mockResolvedValueOnce({ rows: [{ locked: true }] });
    await expect(pgTrySessionAdvisoryLock({} as never, 1)).resolves.toBe(true);

    execute.mockResolvedValueOnce({ rows: [{ locked: false }] });
    await expect(pgTrySessionAdvisoryLock({} as never, 1)).resolves.toBe(false);
  });
});
