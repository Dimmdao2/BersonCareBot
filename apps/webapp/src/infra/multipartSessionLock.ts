import type { Pool, PoolClient } from 'pg';
import { pgAdvisoryXactLock } from '@/infra/db/pgAdvisoryLock';
import { withPoolTransaction } from '@/infra/db/withClient';

const LOCK_PREFIX = 'multipart_session:';

/**
 * Exclusive transaction-scoped advisory lock for a single multipart upload session.
 * Serializes complete/abort/finalize for the same sessionId without holding the lock across S3 HTTP calls.
 */
export async function withMultipartSessionLock<T>(
  pool: Pool,
  sessionId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withPoolTransaction(pool, async (client) => {
    await pgAdvisoryXactLock(client, `${LOCK_PREFIX}${sessionId}`);
    return fn(client);
  });
}
