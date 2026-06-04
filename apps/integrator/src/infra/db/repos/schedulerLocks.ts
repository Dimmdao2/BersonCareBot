import { db } from '../client.js';
import { pgSessionAdvisoryUnlock, pgTrySessionAdvisoryLock } from '../pgAdvisoryLock.js';
import { logger } from '../../observability/logger.js';

export type DbLockHandle = {
  release: () => Promise<void>;
};

export async function tryAcquireSchedulerLock(key: number): Promise<DbLockHandle | null> {
  const client = await db.connect();
  try {
    const locked = await pgTrySessionAdvisoryLock(client, key);
    if (!locked) {
      client.release();
      return null;
    }

    return {
      release: async () => {
        try {
          await pgSessionAdvisoryUnlock(client, key);
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
