import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb, createDbPort } from '../../db/client.js';
import { getAppBaseUrl } from '../../../config/appBaseUrl.js';
import { tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
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
    // Non-zero exit with Restart=on-failure avoids a tight restart loop if two hosts share one DB.
    process.exit(1);
  }

  const { buildDeps } = await import('../../../app/di.js');
  await getAppBaseUrl(createDbPort());
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
      await runSchedulerOrganizationTicks({
        eventGateway: deps.eventGateway,
        listOrganizationIds: () => listSchedulerReminderOrganizationIds(schedulerDb),
        nowIso: () => new Date().toISOString(),
        newEventId: randomUUID,
      });
      await runScheduledOperatorHealthProbeTick({
        dispatchPort: deps.dispatchPort,
        loadConfig: getOperatorHealthProbeConfig,
        loadLastRunAt: getOperatorOutboundProbeLastRunAt,
        runProbes: runOperatorHealthProbes,
      });
    } catch (err) {
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
