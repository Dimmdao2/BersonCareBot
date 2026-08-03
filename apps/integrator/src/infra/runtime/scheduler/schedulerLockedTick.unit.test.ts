import { describe, expect, it, vi } from 'vitest';
import { createSchedulerLockedTickCoordinator } from './schedulerLockedTick.js';

function deferred(): { promise: Promise<number>; resolve: (value: number) => void } {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('scheduler leader cadence', () => {
  it('starts neither organization nor health delivery when the leader lock is lost', async () => {
    const runOrganizationTicks = vi.fn(async () => 0);
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld: vi.fn().mockRejectedValue(new Error('lock lost')),
      runOrganizationTicks,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await expect(coordinator.runTick()).rejects.toThrow('lock lost');

    expect(runOrganizationTicks).not.toHaveBeenCalled();
    expect(runOperatorHealthProbeTick).not.toHaveBeenCalled();
  });

  it('still runs health when the organization sweep fails and reports the sweep separately', async () => {
    const organizationError = new Error('organization rejected');
    const onOrganizationTickError = vi.fn();
    const runOperatorHealthProbeTick = vi.fn(async () => true);
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld: vi.fn(async () => undefined),
      runOrganizationTicks: vi.fn().mockRejectedValue(organizationError),
      runOperatorHealthProbeTick,
      onOrganizationTickError,
    });

    await coordinator.runTick();
    await coordinator.waitForOrganizationTick();

    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(1);
    expect(onOrganizationTickError).toHaveBeenCalledWith(organizationError);
  });

  it('contains a rejected organization error reporter and allows the next sweep', async () => {
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    try {
      const runOrganizationTicks = vi.fn().mockRejectedValue(new Error('organization rejected'));
      const onOrganizationTickError = vi.fn().mockRejectedValue(new Error('reporter rejected'));
      const coordinator = createSchedulerLockedTickCoordinator({
        assertLockStillHeld: vi.fn(async () => undefined),
        runOrganizationTicks,
        runOperatorHealthProbeTick: vi.fn(async () => false),
        onOrganizationTickError,
      });

      await coordinator.runTick();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await coordinator.waitForOrganizationTick();

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(runOrganizationTicks).toHaveBeenCalledTimes(1);

      await coordinator.runTick();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await coordinator.waitForOrganizationTick();

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(runOrganizationTicks).toHaveBeenCalledTimes(2);
      expect(onOrganizationTickError).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('keeps health cadence moving while one slow organization sweep is behind a barrier', async () => {
    const sweep = deferred();
    const runOrganizationTicks = vi.fn(() => sweep.promise);
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const assertLockStillHeld = vi.fn(async () => undefined);
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld,
      runOrganizationTicks,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await coordinator.runTick();
    await coordinator.runTick();

    expect(assertLockStillHeld).toHaveBeenCalledTimes(2);
    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(2);
    expect(runOrganizationTicks).toHaveBeenCalledTimes(1);

    sweep.resolve(1);
    await coordinator.waitForOrganizationTick();
    await coordinator.runTick();

    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(3);
    expect(runOrganizationTicks).toHaveBeenCalledTimes(2);
    await coordinator.waitForOrganizationTick();
  });

  it('does not start another body after a later lock-loss observation', async () => {
    const assertLockStillHeld = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lock lost'));
    const runOrganizationTicks = vi.fn(async () => 0);
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld,
      runOrganizationTicks,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await coordinator.runTick();
    await coordinator.waitForOrganizationTick();
    await expect(coordinator.runTick()).rejects.toThrow('lock lost');

    expect(runOrganizationTicks).toHaveBeenCalledTimes(1);
    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(1);
  });
});
