/** Exponential backoff for retryable transcode failures (wall clock, capped). */
export function backoffMsAfterFailure(attemptsAfterClaim: number): number {
  const capMs = 3600_000;
  const base = 5000;
  const exp = Math.min(Math.max(attemptsAfterClaim, 1), 10);
  return Math.min(capMs, base * 2 ** exp);
}
