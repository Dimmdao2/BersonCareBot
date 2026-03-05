import { randomUUID } from 'node:crypto';
import '../../config/loadEnv.js';
import { appSettings } from '../../config/appSettings.js';
import { logger } from '../../infra/observability/logger.js';

const SCHEDULER_LOCK_KEY = 42001001;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScheduler(): Promise<void> {
  const { db } = await import('../../infra/db/client.js');
  const { buildDeps } = await import('../../app/di.js');
  const deps = buildDeps();

  const client = await db.connect();
  const lockResult = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [SCHEDULER_LOCK_KEY],
  );

  if (lockResult.rows[0]?.locked !== true) {
    logger.warn(
      'Scheduler lock not acquired, another instance is leader. Exiting.',
    );
    client.release();
    await db.end();
    process.exit(0);
  }

  logger.info('Scheduler lock acquired, starting scheduler loop');

  const releaseLock = async (): Promise<void> => {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK_KEY]);
    } finally {
      client.release();
      await db.end();
    }
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
