export type FixedCadenceWakeState = { completedBucket: number | null };

/** Runtime cadence only. Product due-time, recipients and copy remain webapp decisions. */
export async function runFixedCadenceWake(input: {
  nowMs: number;
  periodMs: number;
  state: FixedCadenceWakeState;
  wake: (wakeId: string) => Promise<void>;
}): Promise<boolean> {
  const bucket = Math.floor(input.nowMs / input.periodMs);
  if (input.state.completedBucket === bucket) return false;
  await input.wake(String(bucket));
  input.state.completedBucket = bucket;
  return true;
}
