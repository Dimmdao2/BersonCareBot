import { describe, expect, it, vi } from 'vitest';
import {
  createSchedulerLockedTickCoordinator,
  type SchedulerCadenceStep,
} from './schedulerLockedTick.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function healthWakeDeps() {
  return {
    runOperatorHealthDigestWake: vi.fn(async () => true),
    runSystemHealthGuardWake: vi.fn(async () => true),
  };
}

function deliveryBodyDeps() {
  return {
    runOutgoingDeliveryTick: vi.fn(async () => ({ claimed: 0, processed: 0, errors: 0 })),
    onOutgoingDeliveryTickError: vi.fn(),
  };
}

describe('scheduler leader cadence', () => {
  it.each([
    ['operator_health_digest_wake', 'runOperatorHealthDigestWake'],
    ['system_health_guard_wake', 'runSystemHealthGuardWake'],
    ['operator_health_probe', 'runOperatorHealthProbeTick'],
  ] as const)('names the failing cadence step: %s', async (step, dependencyName) => {
    const cadenceError = new Error('details stay behind the safe error serializer');
    const dependencies = {
      assertLockStillHeld: vi.fn(async () => undefined),
      runOrganizationTicks: vi.fn(async () => 0),
      ...deliveryBodyDeps(),
      ...healthWakeDeps(),
      runOperatorHealthProbeTick: vi.fn(async () => false),
      onOrganizationTickError: vi.fn(),
    };
    dependencies[dependencyName].mockRejectedValue(cadenceError);
    const coordinator = createSchedulerLockedTickCoordinator(dependencies);

    const rejection = coordinator.runTick();

    await expect(rejection).rejects.toMatchObject({
      name: 'SchedulerCadenceStepError',
      step: step satisfies SchedulerCadenceStep,
      cause: cadenceError,
    });
  });

  it('starts neither organization, delivery nor health work when the leader lock is lost', async () => {
    const runOrganizationTicks = vi.fn(async () => 0);
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const wakes = healthWakeDeps();
    const delivery = deliveryBodyDeps();
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld: vi.fn().mockRejectedValue(new Error('lock lost')),
      runOrganizationTicks,
      ...delivery,
      ...wakes,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await expect(coordinator.runTick()).rejects.toThrow('lock lost');

    expect(runOrganizationTicks).not.toHaveBeenCalled();
    expect(delivery.runOutgoingDeliveryTick).not.toHaveBeenCalled();
    expect(wakes.runOperatorHealthDigestWake).not.toHaveBeenCalled();
    expect(wakes.runSystemHealthGuardWake).not.toHaveBeenCalled();
    expect(runOperatorHealthProbeTick).not.toHaveBeenCalled();
  });

  it('still runs all health wakes when the organization sweep fails and reports the sweep separately', async () => {
    const organizationError = new Error('organization rejected');
    const onOrganizationTickError = vi.fn();
    const runOperatorHealthProbeTick = vi.fn(async () => true);
    const wakes = healthWakeDeps();
    const delivery = deliveryBodyDeps();
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld: vi.fn(async () => undefined),
      runOrganizationTicks: vi.fn().mockRejectedValue(organizationError),
      ...delivery,
      ...wakes,
      runOperatorHealthProbeTick,
      onOrganizationTickError,
    });

    await coordinator.runTick();
    await coordinator.waitForOrganizationTick();

    expect(wakes.runOperatorHealthDigestWake).toHaveBeenCalledTimes(1);
    expect(wakes.runSystemHealthGuardWake).toHaveBeenCalledTimes(1);
    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(1);
    expect(onOrganizationTickError).toHaveBeenCalledWith(organizationError);
  });

  it('keeps health cadence moving while a slow outgoing-delivery tick is behind a barrier, and reports its own failure', async () => {
    const delivery = deliveryBodyDeps();
    const deliveryError = new Error('outgoing delivery rejected');
    const stall = (() => {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release };
    })();
    delivery.runOutgoingDeliveryTick.mockImplementation(() => stall.promise.then(() => {
      throw deliveryError;
    }));
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const wakes = healthWakeDeps();
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld: vi.fn(async () => undefined),
      runOrganizationTicks: vi.fn(async () => 0),
      ...delivery,
      ...wakes,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await coordinator.runTick();
    await coordinator.runTick();

    // Second cadence step ran health work without waiting for the still-in-flight delivery tick.
    expect(wakes.runOperatorHealthDigestWake).toHaveBeenCalledTimes(2);
    expect(delivery.runOutgoingDeliveryTick).toHaveBeenCalledTimes(1);

    stall.release();
    await coordinator.waitForOutgoingDeliveryTick();

    expect(delivery.onOutgoingDeliveryTickError).toHaveBeenCalledWith(deliveryError);

    await coordinator.runTick();
    expect(delivery.runOutgoingDeliveryTick).toHaveBeenCalledTimes(2);
  });

  it('contains a rejected organization error reporter and allows the next sweep', async () => {
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    try {
      const reporterEntered = deferred<void>();
      const reporterRelease = deferred<void>();
      const runOrganizationTicks = vi.fn().mockRejectedValue(new Error('organization rejected'));
      const onOrganizationTickError = vi.fn(async () => {
        reporterEntered.resolve(undefined);
        await reporterRelease.promise;
        throw new Error('reporter rejected');
      });
      const coordinator = createSchedulerLockedTickCoordinator({
        assertLockStillHeld: vi.fn(async () => undefined),
        runOrganizationTicks,
        ...deliveryBodyDeps(),
        ...healthWakeDeps(),
        runOperatorHealthProbeTick: vi.fn(async () => false),
        onOrganizationTickError,
      });

      await coordinator.runTick();
      await reporterEntered.promise;
      // Drain the catch/finally continuation. With `void onOrganizationTickError(...)` the tracked
      // sweep is now falsely complete; with the required `await`, it remains behind this barrier.
      await Promise.resolve();
      await Promise.resolve();
      let firstSweepObserved = false;
      const firstSweep = coordinator.waitForOrganizationTick().then(() => {
        firstSweepObserved = true;
      });
      await Promise.resolve();

      const observedBeforeReporterSettled = firstSweepObserved;
      await coordinator.runTick();
      const sweepsWhileReporterPending = runOrganizationTicks.mock.calls.length;

      reporterRelease.resolve(undefined);
      await firstSweep;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(observedBeforeReporterSettled).toBe(false);
      expect(sweepsWhileReporterPending).toBe(1);

      await coordinator.runTick();
      await coordinator.waitForOrganizationTick();

      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(runOrganizationTicks).toHaveBeenCalledTimes(2);
      expect(onOrganizationTickError).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('keeps health cadence moving while one slow organization sweep is behind a barrier', async () => {
    const sweep = deferred<number>();
    const runOrganizationTicks = vi.fn(() => sweep.promise);
    const runOperatorHealthProbeTick = vi.fn(async () => false);
    const assertLockStillHeld = vi.fn(async () => undefined);
    const wakes = healthWakeDeps();
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld,
      runOrganizationTicks,
      ...deliveryBodyDeps(),
      ...wakes,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await coordinator.runTick();
    await coordinator.runTick();

    expect(assertLockStillHeld).toHaveBeenCalledTimes(2);
    expect(wakes.runOperatorHealthDigestWake).toHaveBeenCalledTimes(2);
    expect(wakes.runSystemHealthGuardWake).toHaveBeenCalledTimes(2);
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
    const wakes = healthWakeDeps();
    const delivery = deliveryBodyDeps();
    const coordinator = createSchedulerLockedTickCoordinator({
      assertLockStillHeld,
      runOrganizationTicks,
      ...delivery,
      ...wakes,
      runOperatorHealthProbeTick,
      onOrganizationTickError: vi.fn(),
    });

    await coordinator.runTick();
    await coordinator.waitForOrganizationTick();
    await coordinator.waitForOutgoingDeliveryTick();
    await expect(coordinator.runTick()).rejects.toThrow('lock lost');

    expect(runOrganizationTicks).toHaveBeenCalledTimes(1);
    // D30 Ш9: before the merge, outgoing-delivery ran on its own unlocked loop and never observed
    // the scheduler lock at all — losing it here must now stop it too, exactly like it already
    // stops the organization sweep.
    expect(delivery.runOutgoingDeliveryTick).toHaveBeenCalledTimes(1);
    expect(wakes.runOperatorHealthDigestWake).toHaveBeenCalledTimes(1);
    expect(wakes.runSystemHealthGuardWake).toHaveBeenCalledTimes(1);
    expect(runOperatorHealthProbeTick).toHaveBeenCalledTimes(1);
  });
});
