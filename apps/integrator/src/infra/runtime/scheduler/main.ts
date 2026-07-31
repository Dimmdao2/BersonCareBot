import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb, createDbPort } from '../../db/client.js';
import { SchedulerLockLostError, tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { runSchedulerLockedTick } from './schedulerLockedTick.js';
import {
  assertSchedulerIsolationTelemetryWriterReady,
  reportSchedulerDispatchIsolationFailure,
  reportSchedulerLockIsolationFailure,
} from '../../observability/saasIsolationTelemetry.js';
import { assertSchedulerPoolReady } from '../../db/operationalPoolReadiness.js';
import { listSchedulerReminderOrganizationIds } from '../../db/repos/schedulerReminderOrganizations.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';
import { runOperatorHealthProbes } from '../../../app/operatorHealthProbeRunner.js';
import { getOperatorHealthProbeConfig } from '../../../app/operatorHealthProbeSettings.js';
import { getOperatorOutboundProbeLastRunAt } from '../../db/repos/operatorHealthDrizzle.js';
import { runScheduledOperatorHealthProbeTick } from './operatorHealthProbeTick.js';
import {
  captureSchedulerLoopError,
  captureSchedulerStartupFatal,
  closeIntegratorErrorTracking,
  initIntegratorErrorTracking,
} from '../../observability/errorTracking.js';

const SCHEDULER_LOCK_KEY = 42001001;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScheduler(): Promise<void> {
  const runtimeDb = createDbPort();
  await initIntegratorErrorTracking(runtimeDb, 'scheduler');
  await assertSchedulerIsolationTelemetryWriterReady();
  await assertSchedulerPoolReady();
  // Advisory lock acquisition happens before any staff/patient/org context exists (pre-buildDeps);
  // when DB_PRINCIPAL_CONTEXT_MODE is locked, the connection layer requires SOME principal to be set
  // before it will touch the DB at all (even for a pg_try_advisory_lock, which isn't RLS-governed
  // data access). infra is the right shape here — same as the actual dispatch tick below.
  let lockHandle: Awaited<ReturnType<typeof tryAcquireSchedulerLock>>;
  try {
    lockHandle = await runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }, () =>
      tryAcquireSchedulerLock(SCHEDULER_LOCK_KEY),
    );
  } catch (error) {
    reportSchedulerLockIsolationFailure(error);
    throw error;
  }
  if (!lockHandle) {
    logger.warn('Scheduler lock not acquired, another instance is leader. Exiting.');
    await closeDb();
    // D30 Ш0: this non-zero exit is the leader-election retry, not something it merely tolerates.
    // `Restart=on-failure` + `RestartSec=5` (deploy/systemd/bersoncarebot-scheduler-prod.service)
    // turns every losing instance into a standby that re-races for the lock every 5s, so a dead
    // leader's replacement is picked up automatically without a human restarting anything.
    process.exit(1);
  }

  const { buildDeps } = await import('../../../app/di.js');
  const deps = buildDeps();
  const schedulerDb = createDbPort();

  logger.info('Scheduler lock acquired, starting scheduler loop');

  const releaseLock = async (): Promise<void> => {
    try {
      await lockHandle.release();
      await closeDb();
    } finally {
      await closeIntegratorErrorTracking();
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
      await runSchedulerLockedTick({
        assertLockStillHeld: () => lockHandle.assertStillHeld(),
        runOrganizationTicks: () =>
          runSchedulerOrganizationTicks({
            eventGateway: deps.eventGateway,
            listOrganizationIds: () => listSchedulerReminderOrganizationIds(schedulerDb),
            nowIso: () => new Date().toISOString(),
            newEventId: randomUUID,
          }),
        runOperatorHealthProbeTick: () =>
          runScheduledOperatorHealthProbeTick({
            dispatchPort: deps.dispatchPort,
            loadConfig: getOperatorHealthProbeConfig,
            loadLastRunAt: getOperatorOutboundProbeLastRunAt,
            runProbes: runOperatorHealthProbes,
          }),
      });
    } catch (err) {
      if (err instanceof SchedulerLockLostError) {
        logger.error(
          { err },
          'Scheduler lost its advisory lock mid-loop; exiting so systemd restarts and re-races for leadership',
        );
        reportSchedulerLockIsolationFailure(err);
        await releaseLock().catch((releaseErr) =>
          logger.error({ err: releaseErr }, 'Failed to release scheduler lock during lock-loss shutdown'),
        );
        process.exit(1);
      }
      captureSchedulerLoopError(err);
      reportSchedulerDispatchIsolationFailure(err);
      logger.error({ err }, 'Runtime scheduler tick failed');
    }

    await sleep(appSettings.runtime.scheduler.pollIntervalMs);
  }
}

startScheduler().catch(async (err) => {
  captureSchedulerStartupFatal(err);
  reportSchedulerDispatchIsolationFailure(err);
  logger.error({ err }, 'Runtime scheduler crashed');
  await closeIntegratorErrorTracking();
  process.exitCode = 1;
});
