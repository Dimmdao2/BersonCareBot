import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pgSessionAdvisoryLock, pgSessionAdvisoryUnlock, connect } = vi.hoisted(() => ({
  pgSessionAdvisoryLock: vi.fn(),
  pgSessionAdvisoryUnlock: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../../infra/db/pgAdvisoryLock.js', () => ({
  pgSessionAdvisoryLock,
  pgSessionAdvisoryUnlock,
  RUBITIME_API_ADVISORY_LOCK_KEY: 58220114,
}));

vi.mock('../../infra/db/client.js', () => ({
  db: { connect },
}));

import { withRubitimeApiThrottle } from './rubitimeApiThrottle.js';

describe('withRubitimeApiThrottle', () => {
  const release = vi.fn();
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    pgSessionAdvisoryLock.mockResolvedValue(undefined);
    pgSessionAdvisoryUnlock.mockResolvedValue(undefined);
    connect.mockResolvedValue({ query, release });
    query.mockImplementation((sql: string) => {
      if (sql.includes('last_completed_at')) {
        return Promise.resolve({ rows: [{ last_completed_at: new Date() }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('in test env skips DB and runs fn', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRubitimeApiThrottle(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it('acquires session advisory lock before throttle read and unlocks in finally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
    vi.stubEnv('NODE_ENV', 'production');
    const order: string[] = [];
    pgSessionAdvisoryLock.mockImplementation(async () => {
      order.push('lock');
    });
    pgSessionAdvisoryUnlock.mockImplementation(async () => {
      order.push('unlock');
    });
    query.mockImplementation((sql: string) => {
      if (sql.includes('last_completed_at')) order.push('read');
      if (sql.includes('UPDATE rubitime_api_throttle')) order.push('update');
      return Promise.resolve({
        rows: [{ last_completed_at: new Date('2026-06-05T12:00:00.000Z') }],
        rowCount: 1,
      });
    });

    const fn = vi.fn().mockResolvedValue(42);
    const run = withRubitimeApiThrottle(fn);
    await vi.runAllTimersAsync();
    await expect(run).resolves.toBe(42);
    vi.useRealTimers();

    expect(pgSessionAdvisoryLock).toHaveBeenCalledWith(expect.anything(), 58220114);
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('read'));
    expect(order.indexOf('update')).toBeLessThan(order.indexOf('unlock'));
    expect(pgSessionAdvisoryUnlock).toHaveBeenCalledWith(expect.anything(), 58220114);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
