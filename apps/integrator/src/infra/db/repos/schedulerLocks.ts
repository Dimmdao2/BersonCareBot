import { db } from '../client.js';
import { pgSessionAdvisoryUnlock, pgTrySessionAdvisoryLock } from '../pgAdvisoryLock.js';
import {
  checkoutIntegratorPoolClient,
  destroyPreparedIntegratorClient,
  releasePreparedIntegratorClient,
} from '../withClient.js';
import { logger } from '../../observability/logger.js';

export type DbLockHandle = {
  release: () => Promise<void>;
};

export async function tryAcquireSchedulerLock(key: number): Promise<DbLockHandle | null> {
  const client = await checkoutIntegratorPoolClient(db);
  try {
    const locked = await pgTrySessionAdvisoryLock(client, key);
    if (!locked) {
      await releasePreparedIntegratorClient(client);
      return null;
    }

    return {
      release: async () => {
        let unlockError: unknown;
        try {
          await pgSessionAdvisoryUnlock(client, key);
        } catch (err) {
          unlockError = err;
          logger.error({ err }, 'Failed to release scheduler lock');
        } finally {
          if (unlockError) {
            await destroyPreparedIntegratorClient(client, unlockError);
          } else {
            await releasePreparedIntegratorClient(client);
          }
        }
      },
    };
  } catch (err) {
    await releasePreparedIntegratorClient(client);
    throw err;
  }
}
