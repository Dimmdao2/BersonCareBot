/**
 * Ограничение частоты POST /api/auth/messenger/start по нормализованному телефону.
 * In-memory (один инстанс); при масштабировании — вынести в Redis/БД.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_WINDOW = 12;

const buckets = new Map<string, number[]>();

function pruneEmptyBuckets(windowStart: number): void {
  if (buckets.size < 2000) return;
  for (const [k, times] of buckets) {
    const next = times.filter((t) => t > windowStart);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}

export function isMessengerStartRateLimited(normalizedPhone: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  pruneEmptyBuckets(windowStart);
  const prev = buckets.get(normalizedPhone) ?? [];
  const next = prev.filter((t) => t > windowStart);
  if (next.length >= MAX_STARTS_PER_WINDOW) {
    buckets.set(normalizedPhone, next);
    return true;
  }
  next.push(now);
  buckets.set(normalizedPhone, next);
  return false;
}
