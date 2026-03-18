import type { DbPort } from '../../../kernel/contracts/index.js';
import type { IdempotencyPort } from '../../../kernel/contracts/index.js';

/** In-memory idempotency port (для тестов). */
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

/** PostgreSQL-backed idempotency port. Дедупликация по ключу с TTL. */
export function createPostgresIdempotencyPort(db: DbPort): IdempotencyPort {
  return {
    async tryAcquire(key: string, ttlSec: number): Promise<boolean> {
      const query = `
        INSERT INTO idempotency_keys (key, expires_at)
        VALUES ($1, now() + $2 * interval '1 second')
        ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at
        WHERE idempotency_keys.expires_at < now()
        RETURNING key
      `;
      const res = await db.query<{ key: string }>(query, [key, ttlSec]);
      return (res.rowCount ?? 0) > 0;
    },
  };
}
