import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db } from '../../infra/db/client.js';
import { integratorDrizzleSchema } from '../../infra/db/integratorDrizzleSchema.js';
import {
  pgSessionAdvisoryLock,
  pgSessionAdvisoryUnlock,
  RUBITIME_API_ADVISORY_LOCK_KEY,
} from '../../infra/db/pgAdvisoryLock.js';
import { logger } from '../../infra/observability/logger.js';

/** Rubitime FAQ: min 5s between requests; use 5.5s margin. */
export const RUBITIME_MIN_API_INTERVAL_MS = 5500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttleDisabled(): boolean {
  // Unit tests: no DB; production/staging always pace api2 (Rubitime enforces ~5s between calls).
  return process.env.NODE_ENV === 'test';
}

type ThrottleRow = { last_completed_at: Date };

function throttleRowsFromExecute(raw: unknown): ThrottleRow[] {
  const r = raw as { rows?: ThrottleRow[] };
  return (r.rows ?? []) as ThrottleRow[];
}

/**
 * Runs `fn` under a cluster-wide lock so that the previous Rubitime api2 call
 * (any method) finished at least RUBITIME_MIN_API_INTERVAL_MS ago.
 * Updates `rubitime_api_throttle` after `fn` completes (success or throw).
 */
export async function withRubitimeApiThrottle<T>(fn: () => Promise<T>): Promise<T> {
  if (throttleDisabled()) {
    return fn();
  }

  const client = await db.connect();
  const session = drizzle(client, { schema: integratorDrizzleSchema });
  try {
    await pgSessionAdvisoryLock(client, RUBITIME_API_ADVISORY_LOCK_KEY);
    try {
      const raw = await session.execute(
        sql`SELECT last_completed_at FROM rubitime_api_throttle WHERE id = 1`,
      );
      const row = throttleRowsFromExecute(raw)[0];
      if (!row) {
        throw new Error(
          'RUBITIME_THROTTLE_ROW_MISSING: apply integrator migrations (rubitime_api_throttle)',
        );
      }
      const lastMs = new Date(row.last_completed_at).getTime();
      const waitMs = Math.max(0, RUBITIME_MIN_API_INTERVAL_MS - (Date.now() - lastMs));
      if (waitMs > 0) {
        logger.info({ waitMs, source: 'rubitimeApiThrottle' }, 'rubitime api2 spacing wait');
        await sleep(waitMs);
      }

      try {
        return await fn();
      } finally {
        await session.execute(
          sql`UPDATE rubitime_api_throttle SET last_completed_at = now() WHERE id = 1`,
        );
      }
    } finally {
      await pgSessionAdvisoryUnlock(client, RUBITIME_API_ADVISORY_LOCK_KEY);
    }
  } finally {
    client.release();
  }
}
