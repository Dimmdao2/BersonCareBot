import { describe, expect, it, vi } from 'vitest';
import { runFixedCadenceWake } from './fixedCadenceWake.js';

describe('runFixedCadenceWake', () => {
  it('runs once per cadence bucket and retries the same bucket after failure', async () => {
    const state = { completedBucket: null as number | null };
    const wake = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    await expect(
      runFixedCadenceWake({ nowMs: 900_001, periodMs: 900_000, state, wake }),
    ).rejects.toThrow('network');
    expect(await runFixedCadenceWake({ nowMs: 900_002, periodMs: 900_000, state, wake })).toBe(
      true,
    );
    expect(await runFixedCadenceWake({ nowMs: 1_799_999, periodMs: 900_000, state, wake })).toBe(
      false,
    );
    expect(await runFixedCadenceWake({ nowMs: 1_800_000, periodMs: 900_000, state, wake })).toBe(
      true,
    );
    expect(wake).toHaveBeenCalledTimes(3);
  });
});
