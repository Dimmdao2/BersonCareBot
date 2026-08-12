import { sql } from 'drizzle-orm';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { IdempotencyPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/** Whitelist: gateway idempotency SQL may only touch this integrator table (static templates). */
export const GATEWAY_IDEMPOTENCY_ALLOWED_TABLES = ['integrator.idempotency_keys'] as const;

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
      const res = await runWithDbInfraPrincipal({ source: 'integrator-idempotency' }, () =>
        runIntegratorNamedRoot<{ acquired: boolean }>(
          db,
          'app.try_acquire_integrator_idempotency(text,integer)',
          [key, ttlSec],
          sql`SELECT app.try_acquire_integrator_idempotency(${key}, ${ttlSec}::integer) AS acquired`,
        ));
      return res.rows[0]?.acquired === true;
    },
    async release(key: string): Promise<void> {
      await runWithDbInfraPrincipal({ source: 'integrator-idempotency' }, () =>
        runIntegratorNamedRoot(
          db,
          'app.release_integrator_idempotency(text)',
          [key],
          sql`SELECT app.release_integrator_idempotency(${key})`,
        ));
    },
  };
}
