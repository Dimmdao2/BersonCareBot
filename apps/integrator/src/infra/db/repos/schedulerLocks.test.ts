import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../pgAdvisoryLock.js', () => ({
  integratorDrizzleOnPgClient: vi.fn(),
  pgTrySessionAdvisoryLock: vi.fn(),
  pgSessionAdvisoryUnlock: vi.fn(),
}));

vi.mock('../client.js', () => ({
  db: { connect: vi.fn() },
}));

import { db } from '../client.js';
import { pgSessionAdvisoryUnlock, pgTrySessionAdvisoryLock } from '../pgAdvisoryLock.js';
import { tryAcquireSchedulerLock } from './schedulerLocks.js';

describe('tryAcquireSchedulerLock', () => {
  const release = vi.fn();
  const client = { query: vi.fn(), release };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.connect).mockResolvedValue(client as never);
  });

  it('returns null and releases client when try lock fails', async () => {
    vi.mocked(pgTrySessionAdvisoryLock).mockResolvedValue(false);

    const handle = await tryAcquireSchedulerLock(9001);

    expect(handle).toBeNull();
    expect(pgTrySessionAdvisoryLock).toHaveBeenCalledWith(client, 9001);
    expect(release).toHaveBeenCalledTimes(1);
    expect(pgSessionAdvisoryUnlock).not.toHaveBeenCalled();
  });

  it('returns handle that unlocks and releases on release()', async () => {
    vi.mocked(pgTrySessionAdvisoryLock).mockResolvedValue(true);

    const handle = await tryAcquireSchedulerLock(9002);
    expect(handle).not.toBeNull();

    await handle!.release();

    expect(pgSessionAdvisoryUnlock).toHaveBeenCalledWith(client, 9002);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
