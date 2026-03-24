/** Простой in-memory rate-limit для POST /api/auth/pin/set (не для serverless multi-instance). */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const buckets = new Map<string, number[]>();

function pruneBuckets(windowStart: number): void {
  if (buckets.size < 2000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

export function isPinSetRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  pruneBuckets(windowStart);
  const prev = buckets.get(userId) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_PER_WINDOW) {
    buckets.set(userId, next);
    return true;
  }
  next.push(now);
  buckets.set(userId, next);
  return false;
}
