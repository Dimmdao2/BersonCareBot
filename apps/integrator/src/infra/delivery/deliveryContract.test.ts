import { describe, expect, it } from 'vitest';
import { retryDelaySecondsAfterFailure } from './deliveryContract.js';

// D20 level-3 item 18: outgoing_delivery_queue (this ladder, consumed by
// runtime/worker/outgoingDeliveryWorker.ts) is the TARGET retry ladder per already-closed
// owner decision #11 (D30_SCHEDULER_REVERSAL_PLAN.md §3: outgoing_delivery_queue stays,
// integrator.message_retry_jobs — the other ladder, runtime/worker/retryPolicy.ts — is cut).
describe('D20 item 18: outgoing_delivery_queue retry backoff ladder', () => {
  it('escalates the delay after each successive failed attempt instead of retrying immediately', () => {
    expect(retryDelaySecondsAfterFailure(1)).toBe(60);
    expect(retryDelaySecondsAfterFailure(2)).toBe(300);
    expect(retryDelaySecondsAfterFailure(3)).toBe(900);
    expect(retryDelaySecondsAfterFailure(4)).toBe(3600);
  });

  it('plateaus at the longest configured delay instead of resetting to the shortest one', () => {
    expect(retryDelaySecondsAfterFailure(5)).toBe(3600);
    expect(retryDelaySecondsAfterFailure(100)).toBe(3600);
  });

  it('falls back to the shortest delay for an invalid attempt number instead of retrying with no delay', () => {
    expect(retryDelaySecondsAfterFailure(0)).toBe(60);
    expect(retryDelaySecondsAfterFailure(-1)).toBe(60);
    expect(retryDelaySecondsAfterFailure(Number.NaN)).toBe(60);
  });
});
