import { db } from '../client.js';
import { logger } from '../../observability/logger.js';

export type DbLockHandle = {
  release: () => Promise<void>;
};

export async function tryAcquireSchedulerLock(key: number): Promise<DbLockHandle | null> {
  const client = await db.connect();
  try {
    const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    if (result.rows[0]?.locked !== true) {
      client.release();
      return null;
    }

    return {
      release: async () => {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [key]);
        } catch (err) {
          logger.error({ err }, 'Failed to release scheduler lock');
        } finally {
          client.release();
        }
      },
    };
  } catch (err) {
    client.release();
    throw err;
  }
}
