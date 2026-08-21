export type SchedulerLockedTickDeps = {
  /** Throws when this process no longer holds the scheduler lock. */
  assertLockStillHeld: () => Promise<void>;
  runOrganizationTicks: () => Promise<number>;
  /** D30 Ш9: the resident process also owns due outgoing-delivery execution. */
  runOutgoingDeliveryTick: () => Promise<unknown>;
  /** D30 Ш9: and direct-public-write retry execution. */
  runDirectPublicWriteRetryTick: () => Promise<unknown>;
  runOperatorHealthDigestWake: () => Promise<boolean>;
  runSystemHealthGuardWake: () => Promise<boolean>;
  runOperatorHealthProbeTick: () => Promise<boolean>;
  onOrganizationTickError: (error: unknown) => void | Promise<void>;
  onOutgoingDeliveryTickError: (error: unknown) => void | Promise<void>;
  onDirectPublicWriteRetryTickError: (error: unknown) => void | Promise<void>;
};

export type SchedulerLockedTickCoordinator = {
  /** One leader cadence step: prove ownership, keep every body single-flight, run health now. */
  runTick: () => Promise<void>;
  /** Test/shutdown observation only; it never starts another sweep. */
  waitForOrganizationTick: () => Promise<void>;
  waitForOutgoingDeliveryTick: () => Promise<void>;
  waitForDirectPublicWriteRetryTick: () => Promise<void>;
};

type SingleFlightBody = {
  startIfIdle: () => void;
  wait: () => Promise<void>;
};

/**
 * A background body that is kicked once per cadence step but never runs two overlapping copies
 * of itself: if the previous run is still in flight, a new cadence step is a no-op for this body.
 * Errors are routed to `onError` and never become unhandled rejections or pin single-flight forever.
 */
function createSingleFlightBody(
  run: () => Promise<unknown>,
  onError: (error: unknown) => void | Promise<void>,
): SingleFlightBody {
  let inFlight: Promise<void> | null = null;

  return {
    startIfIdle(): void {
      if (inFlight !== null) return;

      const started = Promise.resolve().then(async () => {
        await run();
      });
      const tracked = started
        .catch(async (error: unknown) => {
          try {
            await onError(error);
          } catch {
            // Terminal background-task boundary. The callback already owns reporting; its own
            // failure must not become an unhandled rejection or pin single-flight forever.
          }
        })
        .finally(() => {
          if (inFlight === tracked) inFlight = null;
        });
      inFlight = tracked;
    },
    wait: () => inFlight ?? Promise.resolve(),
  };
}

/**
 * Keeps operator-health cadence independent from the potentially long tenant sweep and delivery
 * ticks.
 *
 * The leader lock is still the common authority: every cadence step proves ownership before it
 * starts any body. Organization work, outgoing-delivery dispatch and direct-public-write retries
 * are each single-flight, so a slow round is not duplicated, but none of them is awaited by the
 * health tick. A failed body is reported through its own boundary and cannot suppress this or
 * later health ticks.
 */
export function createSchedulerLockedTickCoordinator(
  deps: SchedulerLockedTickDeps,
): SchedulerLockedTickCoordinator {
  const organizationTick = createSingleFlightBody(
    deps.runOrganizationTicks,
    deps.onOrganizationTickError,
  );
  const outgoingDeliveryTick = createSingleFlightBody(
    deps.runOutgoingDeliveryTick,
    deps.onOutgoingDeliveryTickError,
  );
  const directPublicWriteRetryTick = createSingleFlightBody(
    deps.runDirectPublicWriteRetryTick,
    deps.onDirectPublicWriteRetryTickError,
  );

  return {
    async runTick(): Promise<void> {
      // D30 Ш0 §2a condition 2: no body may start after this exact lock connection is lost.
      await deps.assertLockStillHeld();
      organizationTick.startIfIdle();
      outgoingDeliveryTick.startIfIdle();
      directPublicWriteRetryTick.startIfIdle();
      await deps.runOperatorHealthDigestWake();
      await deps.runSystemHealthGuardWake();
      await deps.runOperatorHealthProbeTick();
    },

    waitForOrganizationTick: organizationTick.wait,
    waitForOutgoingDeliveryTick: outgoingDeliveryTick.wait,
    waitForDirectPublicWriteRetryTick: directPublicWriteRetryTick.wait,
  };
}
