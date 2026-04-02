/**
 * Contract: integrator projection worker vs webapp POST /api/integrator/events.
 * Recoverable failures must use retry/backoff; permanent validation failures must not exhaust max_attempts uselessly.
 */

/** Classify outbound HTTP result from webapp emit (integrator → webapp). */
export function isRecoverableWebappEmitFailure(result: {
  ok: boolean;
  status: number;
  error?: string;
}): boolean {
  if (result.ok) return true;
  const s = result.status;
  if (s === 0) return true;
  if (s >= 500) return true;
  if (s === 408 || s === 429) return true;
  if (s === 503) return true;
  return false;
}
