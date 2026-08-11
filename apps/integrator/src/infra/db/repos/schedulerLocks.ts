import { db } from '../client.js';
import {
  pgSessionAdvisoryLockStillHeld,
  pgSessionAdvisoryUnlock,
  pgTrySessionAdvisoryLock,
} from '../pgAdvisoryLock.js';
import {
  checkoutIntegratorPortContextSession,
  checkoutIntegratorPoolClient,
  destroyPreparedIntegratorClient,
  releasePreparedIntegratorClient,
} from '../withClient.js';
import { logger } from '../../observability/logger.js';

export type DbLockHandle = {
  release: () => Promise<void>;
  /**
   * Throws {@link SchedulerLockLostError} unless this exact connection still holds the lock.
   * Must be called at the start of every tick (D30 Ш0 §2a condition 2) — the lock is per-connection,
   * so nothing else notices a dropped connection releasing it.
   */
  assertStillHeld: () => Promise<void>;
};

/** Raised by {@link DbLockHandle.assertStillHeld} when the holding connection died or the lock is gone. */
export class SchedulerLockLostError extends Error {
  constructor(key: number, options?: { cause?: unknown }) {
    super(`Scheduler advisory lock ${key} is no longer held on this connection`);
    this.name = 'SchedulerLockLostError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export async function tryAcquireSchedulerLock(key: number): Promise<DbLockHandle | null> {
  const portContext = process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context';
  const session = portContext ? await checkoutIntegratorPortContextSession(db) : undefined;
  const client = session?.client ?? (await checkoutIntegratorPoolClient(db));
  // This client is held open for the lifetime of the process instead of being returned to the
  // pool, so it never passes through the pool's own idle-client error handling. Without a
  // listener here, a dead connection (DB restart, pgbouncer drop) emits an unhandled 'error' and
  // crashes the whole process instead of failing the next assertStillHeld() call cleanly.
  let connectionErrored: unknown;
  client.on('error', (err) => {
    connectionErrored = err;
    // A throw from inside an 'error' listener is NOT catchable anywhere and crashes the process
    // immediately — exactly the failure mode this listener exists to avoid. Logging must never
    // be able to reintroduce it.
    try {
      logger.error({ err }, 'Scheduler lock connection reported an error; lock will read as lost');
    } catch {
      /* best-effort logging only; never let this throw back into the 'error' event */
    }
  });
  try {
    const locked = session
      ? await session.run((boundedClient) => pgTrySessionAdvisoryLock(boundedClient, key))
      : await pgTrySessionAdvisoryLock(client, key);
    if (!locked) {
      if (session) {
        session.release();
      } else {
        await releasePreparedIntegratorClient(client);
      }
      return null;
    }

    return {
      release: async () => {
        let unlockError: unknown;
        try {
          if (session) {
            await session.run((boundedClient) => pgSessionAdvisoryUnlock(boundedClient, key));
          } else {
            await pgSessionAdvisoryUnlock(client, key);
          }
        } catch (err) {
          unlockError = err;
          logger.error({ err }, 'Failed to release scheduler lock');
        } finally {
          if (unlockError) {
            if (session) {
              session.release();
            } else {
              await destroyPreparedIntegratorClient(client, unlockError);
            }
          } else {
            if (session) {
              session.release();
            } else {
              await releasePreparedIntegratorClient(client);
            }
          }
        }
      },
      assertStillHeld: async () => {
        if (connectionErrored !== undefined) {
          throw new SchedulerLockLostError(key, { cause: connectionErrored });
        }
        let stillHeld: boolean;
        try {
          stillHeld = session
            ? await session.run((boundedClient) =>
                pgSessionAdvisoryLockStillHeld(boundedClient, key),
              )
            : await pgSessionAdvisoryLockStillHeld(client, key);
        } catch (err) {
          throw new SchedulerLockLostError(key, { cause: err });
        }
        if (!stillHeld) {
          throw new SchedulerLockLostError(key);
        }
      },
    };
  } catch (err) {
    if (session) {
      session.release();
    } else {
      await releasePreparedIntegratorClient(client);
    }
    throw err;
  }
}
