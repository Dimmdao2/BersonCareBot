/**
 * Mirrors webapp `ingestErrorClassification` contract: integrator must not burn retries on permanent client errors.
 */
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
