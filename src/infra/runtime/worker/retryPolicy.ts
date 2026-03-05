import type { DeliveryJob } from '../../../kernel/contracts/index.js';

export type RetryDecision =
  | { kind: 'complete' }
  | { kind: 'retry'; runAt: string; nextAttempts: number };

export function decideRetry(input: {
  job: DeliveryJob;
  nowIso: string;
  retryDelaySeconds: number;
}): RetryDecision {
  const attemptsMade = typeof input.job.attemptsMade === 'number'
    ? Math.max(0, Math.trunc(input.job.attemptsMade))
    : Math.max(0, Math.trunc(input.job.attempts));
  const nextAttempts = attemptsMade + 1;
  const maxAttempts = input.job.retry?.maxAttempts ?? input.job.maxAttempts;
  if (nextAttempts >= maxAttempts) {
    return { kind: 'complete' };
  }

  const backoff = input.job.retry?.backoffSeconds?.[attemptsMade];
  const nowMs = Date.parse(input.nowIso);
  const delaySeconds = typeof backoff === 'number' && Number.isFinite(backoff)
    ? Math.max(0, Math.trunc(backoff))
    : Math.max(0, Math.trunc(input.retryDelaySeconds));
  const delayMs = delaySeconds * 1000;
  return {
    kind: 'retry',
    runAt: new Date(nowMs + delayMs).toISOString(),
    nextAttempts,
  };
}
