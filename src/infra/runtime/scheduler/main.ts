import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb } from '../../db/client.js';
import { tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';

const SCHEDULER_LOCK_KEY = 42001001;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScheduler(): Promise<void> {
  const lockHandle = await tryAcquireSchedulerLock(SCHEDULER_LOCK_KEY);
  if (!lockHandle) {
    logger.warn(
      'Scheduler lock not acquired, another instance is leader. Exiting.',
    );
    await closeDb();
    process.exit(0);
  }

  const { buildDeps } = await import('../../../app/di.js');
  const deps = buildDeps();

  logger.info('Scheduler lock acquired, starting scheduler loop');

  const releaseLock = async (): Promise<void> => {
    await lockHandle.release();
    await closeDb();
  };

  process.on('SIGINT', async () => {
    await releaseLock();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await releaseLock();
    process.exit(0);
  });

  while (true) {
    try {
      await deps.eventGateway.handleIncomingEvent({
        type: 'schedule.tick',
        meta: {
          eventId: `sch:${randomUUID()}`,
          occurredAt: new Date().toISOString(),
          source: 'scheduler',
        },
        payload: {
          trigger: 'schedule.tick',
        },
      });
    } catch (err) {
      logger.error({ err }, 'Runtime scheduler tick failed');
    }

    await sleep(appSettings.runtime.scheduler.pollIntervalMs);
  }
}

startScheduler().catch((err) => {
  logger.error({ err }, 'Runtime scheduler crashed');
  process.exit(1);
});
