export type SchedulerLockedTickDeps = {
  /** Throws when this process no longer holds the scheduler lock. */
  assertLockStillHeld: () => Promise<void>;
  runOrganizationTicks: () => Promise<number>;
  /** D30 Ш9: the resident process also owns due outgoing-delivery execution. */
  runOutgoingDeliveryTick: () => Promise<unknown>;
  runOperatorHealthDigestWake: () => Promise<boolean>;
  runSystemHealthGuardWake: () => Promise<boolean>;
  runOperatorHealthProbeTick: () => Promise<boolean>;
  onOrganizationTickError: (error: unknown) => void | Promise<void>;
  onOutgoingDeliveryTickError: (error: unknown) => void | Promise<void>;
};

export type SchedulerLockedTickCoordinator = {
  /** One leader cadence step: prove ownership, keep every body single-flight, run health now. */
  runTick: () => Promise<void>;
  /** Test/shutdown observation only; it never starts another sweep. */
  waitForOrganizationTick: () => Promise<void>;
  waitForOutgoingDeliveryTick: () => Promise<void>;
};

export type SchedulerCadenceStep =
  | 'operator_health_digest_wake'
  | 'system_health_guard_wake'
  | 'operator_health_probe';

/** Safe, value-free identification of the periodic step that failed. */
export class SchedulerCadenceStepError extends Error {
  constructor(
    readonly step: SchedulerCadenceStep,
    options: { cause: unknown },
  ) {
    super(`scheduler cadence step failed: ${step}`, options);
    this.name = 'SchedulerCadenceStepError';
  }
}

async function runCadenceStep(
  step: SchedulerCadenceStep,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (cause) {
    throw new SchedulerCadenceStepError(step, { cause });
  }
}

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
 * starts any body. Organization work and outgoing-delivery dispatch are each single-flight, so a
 * slow round is not duplicated, but neither is awaited by the health tick. A failed body is
 * reported through its own boundary and cannot suppress this or later health ticks.
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

  return {
    async runTick(): Promise<void> {
      // D30 Ш0 §2a condition 2: no body may start after this exact lock connection is lost.
      await deps.assertLockStillHeld();
      organizationTick.startIfIdle();
      outgoingDeliveryTick.startIfIdle();
      await runCadenceStep('operator_health_digest_wake', deps.runOperatorHealthDigestWake);
      await runCadenceStep('system_health_guard_wake', deps.runSystemHealthGuardWake);
      await runCadenceStep('operator_health_probe', deps.runOperatorHealthProbeTick);
    },

    waitForOrganizationTick: organizationTick.wait,
    waitForOutgoingDeliveryTick: outgoingDeliveryTick.wait,
  };
}
