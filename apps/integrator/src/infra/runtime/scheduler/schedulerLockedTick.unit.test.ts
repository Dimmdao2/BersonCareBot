import { describe, expect, it, vi } from 'vitest';
import { runSchedulerLockedTick } from './schedulerLockedTick.js';

/**
 * D30 Ш0 §2a condition 2: a tick must not do dispatch work once the scheduler lock is lost.
 * Poromka this catches: someone moves the ownership check to run after the tick bodies (or
 * drops it), so a lock-losing instance keeps ticking. That reorder is exactly what the second
 * test below breaks on purpose.
 */
describe('runSchedulerLockedTick', () => {
  it('does not run either tick body when the lock ownership check fails', async () => {
    const calls: string[] = [];
    const assertLockStillHeld = vi.fn().mockRejectedValue(new Error('lock lost'));
    const runOrganizationTicks = vi.fn().mockImplementation(async () => {
      calls.push('organization');
      return 0;
    });
    const runOperatorHealthProbeTick = vi.fn().mockImplementation(async () => {
      calls.push('operatorHealth');
    });

    await expect(
      runSchedulerLockedTick({ assertLockStillHeld, runOrganizationTicks, runOperatorHealthProbeTick }),
    ).rejects.toThrow('lock lost');

    expect(runOrganizationTicks).not.toHaveBeenCalled();
    expect(runOperatorHealthProbeTick).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('runs the ownership check before both tick bodies when the lock is held', async () => {
    const calls: string[] = [];
    const assertLockStillHeld = vi.fn().mockImplementation(async () => {
      calls.push('assert');
    });
    const runOrganizationTicks = vi.fn().mockImplementation(async () => {
      calls.push('organization');
      return 3;
    });
    const runOperatorHealthProbeTick = vi.fn().mockImplementation(async () => {
      calls.push('operatorHealth');
    });

    await runSchedulerLockedTick({ assertLockStillHeld, runOrganizationTicks, runOperatorHealthProbeTick });

    expect(calls).toEqual(['assert', 'organization', 'operatorHealth']);
  });
});
