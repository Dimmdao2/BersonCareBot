import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('./client.js', () => ({
  db: { query: queryMock },
}));

import { getBranchTimezone, resetBranchTimezoneCacheForTests } from './branchTimezone.js';

describe('getBranchTimezone', () => {
  afterEach(() => {
    queryMock.mockReset();
    resetBranchTimezoneCacheForTests();
    vi.useRealTimers();
  });

  it('returns DB timezone on cache miss and does not query again within TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    queryMock.mockResolvedValue({ rows: [{ timezone: 'Europe/Samara' }] });

    const a = await getBranchTimezone(17356);
    const b = await getBranchTimezone(17356);
    expect(a).toBe('Europe/Samara');
    expect(b).toBe('Europe/Samara');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    queryMock.mockResolvedValue({ rows: [{ timezone: 'Europe/Moscow' }] });

    await getBranchTimezone(42);
    expect(queryMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(61_000);
    queryMock.mockResolvedValue({ rows: [{ timezone: 'Europe/Samara' }] });
    const tz = await getBranchTimezone(42);
    expect(tz).toBe('Europe/Samara');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('falls back for missing row', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(getBranchTimezone(999999)).resolves.toBe('Europe/Moscow');
  });

  it('falls back for invalid IANA and caches fallback', async () => {
    vi.useFakeTimers({ now: 0 });
    queryMock.mockResolvedValue({ rows: [{ timezone: 'Not/A/Zone' }] });
    const a = await getBranchTimezone(1);
    const b = await getBranchTimezone(1);
    expect(a).toBe('Europe/Moscow');
    expect(b).toBe('Europe/Moscow');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('accepts string branch id', async () => {
    queryMock.mockResolvedValue({ rows: [{ timezone: 'Europe/Moscow' }] });
    await expect(getBranchTimezone('17356')).resolves.toBe('Europe/Moscow');
  });
});
