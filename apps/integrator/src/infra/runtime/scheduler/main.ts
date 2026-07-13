import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb } from '../../db/client.js';
import { tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';

const SCHEDULER_LOCK_KEY = 42001001;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScheduler(): Promise<void> {
  // Advisory lock acquisition happens before any staff/patient/org context exists (pre-buildDeps);
  // under DB_PRINCIPAL_CONTEXT_MODE=locked the connection layer requires SOME principal to be set
  // before it will touch the DB at all (even for a pg_try_advisory_lock, which isn't RLS-governed
  // data access). infra is the right shape here — same as the actual dispatch tick below.
  const lockHandle = await runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }, () =>
    tryAcquireSchedulerLock(SCHEDULER_LOCK_KEY),
  );
  if (!lockHandle) {
    logger.warn(
      'Scheduler lock not acquired, another instance is leader. Exiting.',
    );
    await closeDb();
    // Non-zero exit with Restart=on-failure avoids a tight restart loop if two hosts share one DB.
    process.exit(1);
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
      // handleIncomingEvent does idempotency-key bookkeeping (tenant-agnostic) before routing to the
      // schedule.tick handler chain (which already installs its own infra principal further down via
      // scheduler.ts's runSchedulerTick). schedule.tick itself is the only event type this process
      // ever raises, so wrapping the whole call here is safe and matches the lock-acquisition wrap above.
      await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, () =>
        deps.eventGateway.handleIncomingEvent({
          type: 'schedule.tick',
          meta: {
            eventId: `sch:${randomUUID()}`,
            occurredAt: new Date().toISOString(),
            source: 'scheduler',
          },
          payload: {
            trigger: 'schedule.tick',
          },
        }),
      );
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
