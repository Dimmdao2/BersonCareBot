export type SchedulerLockedTickDeps = {
  /** Throws when this process no longer holds the scheduler lock. */
  assertLockStillHeld: () => Promise<void>;
  runOrganizationTicks: () => Promise<number>;
  runOperatorHealthProbeTick: () => Promise<boolean>;
};

/**
 * D30 Ш0 §2a condition 2: ownership of the scheduler's advisory lock is verified before any
 * dispatch work runs on a tick, not just once at process start. If the lock was lost, the
 * assertion throws and neither tick body below runs — the caller (main.ts) exits the process on
 * that error instead of looping without the lock.
 */
export async function runSchedulerLockedTick(deps: SchedulerLockedTickDeps): Promise<void> {
  await deps.assertLockStillHeld();
  await deps.runOrganizationTicks();
  await deps.runOperatorHealthProbeTick();
}
