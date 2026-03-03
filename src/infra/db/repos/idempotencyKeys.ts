import type { IdempotencyPort } from '../../../kernel/contracts/index.js';

/** In-memory idempotency port placeholder; replace with DB table storage later. */
export function createInMemoryIdempotencyPort(): IdempotencyPort {
  const keys = new Map<string, number>();
  return {
    async tryAcquire(key: string, ttlSec: number): Promise<boolean> {
      const now = Date.now();
      const expiresAt = keys.get(key);
      if (expiresAt && expiresAt > now) return false;
      keys.set(key, now + ttlSec * 1000);
      return true;
    },
  };
}
