import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { IdempotencyPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

/** Whitelist: gateway idempotency SQL may only touch this integrator table (static templates). */
export const GATEWAY_IDEMPOTENCY_ALLOWED_TABLES = ['idempotency_keys'] as const;

/**
 * Sentinel row for incoming webhook dedup (event gateway). Not an HTTP body hash;
 * keeps NOT NULL columns satisfied when the table matches webapp idempotency shape.
 */
const GATEWAY_IDEM_REQUEST_HASH = '__integrator_incoming_event__';
const GATEWAY_IDEM_STATUS = 200;
const GATEWAY_IDEM_RESPONSE_BODY = '{}';

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
    async release(key: string): Promise<void> {
      keys.delete(key);
    },
  };
}

/** PostgreSQL-backed idempotency port. Дедупликация по ключу с TTL. */
export function createPostgresIdempotencyPort(db: DbPort): IdempotencyPort {
  return {
    async tryAcquire(key: string, ttlSec: number): Promise<boolean> {
      const res = await runIntegratorSql<{ key: string }>(
        db,
        sql`INSERT INTO idempotency_keys (key, request_hash, status, response_body, expires_at)
            VALUES (
              ${key},
              ${GATEWAY_IDEM_REQUEST_HASH},
              ${GATEWAY_IDEM_STATUS},
              ${GATEWAY_IDEM_RESPONSE_BODY}::jsonb,
              now() + ${ttlSec} * interval '1 second'
            )
            ON CONFLICT (key) DO UPDATE SET
              expires_at = EXCLUDED.expires_at,
              request_hash = EXCLUDED.request_hash,
              status = EXCLUDED.status,
              response_body = EXCLUDED.response_body
            WHERE idempotency_keys.expires_at < now()
            RETURNING key`,
      );
      return (res.rowCount ?? 0) > 0;
    },
    async release(key: string): Promise<void> {
      await runIntegratorSql(
        db,
        sql`DELETE FROM idempotency_keys WHERE key = ${key}`,
      );
    },
  };
}
