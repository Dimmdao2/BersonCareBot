/** Каркас policy ретраев оркестратора. */
export type RetryPolicyDecision = 'retry' | 'stop';

/** Временная policy: по умолчанию не ретраить. */
export function decideRetry(): RetryPolicyDecision {
  return 'stop';
}
