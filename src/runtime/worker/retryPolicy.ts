import type { DeliveryJob } from '../../kernel/contracts/index.js';

export type RetryDecision =
  | { kind: 'complete' }
  | { kind: 'retry'; runAt: string; nextAttempts: number };

export function decideRetry(input: {
  job: DeliveryJob;
  nowIso: string;
  retryDelaySeconds: number;
}): RetryDecision {
  const nextAttempts = input.job.attempts + 1;
  if (nextAttempts >= input.job.maxAttempts) {
    return { kind: 'complete' };
  }
  const nowMs = Date.parse(input.nowIso);
  const delayMs = Math.max(0, Math.trunc(input.retryDelaySeconds)) * 1000;
  return {
    kind: 'retry',
    runAt: new Date(nowMs + delayMs).toISOString(),
    nextAttempts,
  };
}
