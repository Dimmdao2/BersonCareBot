export type SchedulerLockedTickDeps = {
  /** Throws when this process no longer holds the scheduler lock. */
  assertLockStillHeld: () => Promise<void>;
  runOrganizationTicks: () => Promise<number>;
  runOperatorHealthProbeTick: () => Promise<boolean>;
  onOrganizationTickError: (error: unknown) => void | Promise<void>;
};

export type SchedulerLockedTickCoordinator = {
  /** One leader cadence step: prove ownership, keep one org sweep running, run health now. */
  runTick: () => Promise<void>;
  /** Test/shutdown observation only; it never starts another sweep. */
  waitForOrganizationTick: () => Promise<void>;
};

/**
 * Keeps operator-health cadence independent from the potentially long tenant sweep.
 *
 * The leader lock is still the common authority: every cadence step proves ownership before it
 * starts either body. Organization work is single-flight, so a slow sweep is not duplicated, but
 * it is deliberately not awaited by the health tick. A failed sweep is reported through its own
 * boundary and cannot suppress this or later health ticks.
 */
export function createSchedulerLockedTickCoordinator(
  deps: SchedulerLockedTickDeps,
): SchedulerLockedTickCoordinator {
  let organizationTickInFlight: Promise<void> | null = null;

  const startOrganizationTickIfIdle = (): void => {
    if (organizationTickInFlight !== null) return;

    const started = Promise.resolve().then(async () => {
      await deps.runOrganizationTicks();
    });
    const tracked = started
      .catch(async (error: unknown) => {
        try {
          await deps.onOrganizationTickError(error);
        } catch {
          // This is the terminal background-task boundary. The callback already owns reporting;
          // its own failure must not become an unhandled rejection or pin single-flight forever.
        }
      })
      .finally(() => {
        if (organizationTickInFlight === tracked) organizationTickInFlight = null;
      });
    organizationTickInFlight = tracked;
  };

  return {
    async runTick(): Promise<void> {
      // D30 Ш0 §2a condition 2: neither body may start after this exact lock connection is lost.
      await deps.assertLockStillHeld();
      startOrganizationTickIfIdle();
      await deps.runOperatorHealthProbeTick();
    },

    async waitForOrganizationTick(): Promise<void> {
      await organizationTickInFlight;
    },
  };
}
