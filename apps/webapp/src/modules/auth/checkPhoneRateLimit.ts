/**
 * Ограничение частоты POST /api/auth/check-phone по нормализованному номеру (анти-DoS / перебор).
 * In-memory; при горизонтальном масштабировании — Redis или edge rate-limit.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CHECKS_PER_WINDOW = 40;

const buckets = new Map<string, number[]>();

function prune(windowStart: number): void {
  if (buckets.size < 3000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

export function isCheckPhoneRateLimited(normalizedPhone: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  prune(windowStart);
  const prev = buckets.get(normalizedPhone) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_CHECKS_PER_WINDOW) {
    buckets.set(normalizedPhone, next);
    return true;
  }
  next.push(now);
  buckets.set(normalizedPhone, next);
  return false;
}
