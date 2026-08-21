import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb, createDbPort } from '../../db/client.js';
import { createDbWritePort } from '../../db/writePort.js';
import { SchedulerLockLostError, tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { runFixedCadenceWake } from './fixedCadenceWake.js';
import { createSchedulerLockedTickCoordinator } from './schedulerLockedTick.js';
import {
  assertSchedulerIsolationTelemetryWriterReady,
  assertWorkerIsolationTelemetryWriterReady,
  reportSchedulerDispatchIsolationFailure,
  reportSchedulerLockIsolationFailure,
  reportWorkerOutgoingIsolationFailure,
  reportWorkerProjectionIsolationFailure,
  reportWorkerQueueIsolationFailure,
} from '../../observability/saasIsolationTelemetry.js';
import { assertDeliveryWorkerPoolReady, assertSchedulerPoolReady } from '../../db/operationalPoolReadiness.js';
import { listSchedulerReminderOrganizationIds } from '../../db/repos/schedulerReminderOrganizations.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';
import { runOperatorHealthProbes } from '../../../app/operatorHealthProbeRunner.js';
import { getOperatorHealthProbeConfig } from '../../../app/operatorHealthProbeSettings.js';
import { getOperatorOutboundProbeLastRunAt } from '../../db/repos/operatorHealthDrizzle.js';
import { runScheduledOperatorHealthProbeTick } from './operatorHealthProbeTick.js';
import { runDirectPublicWriteRetryWorkerTick } from '../worker/directPublicWriteRetryWorker.js';
import { runOutgoingDeliveryWorkerTick } from '../worker/outgoingDeliveryWorker.js';
import { createOperatorAwareDeliveryAttemptWritePort } from '../worker/operatorDeliveryAttemptWritePort.js';
import {
  captureSchedulerLoopError,
  captureSchedulerStartupFatal,
  captureWorkerLoopError,
  closeIntegratorErrorTracking,
  initIntegratorErrorTracking,
} from '../../observability/errorTracking.js';

const SCHEDULER_LOCK_KEY = 42001001;
const DIGEST_WAKE_PERIOD_MS = 60 * 60 * 1000;
const HEALTH_GUARD_WAKE_PERIOD_MS = 15 * 60 * 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * D30 Ш9: `worker` and `scheduler` are one resident process now — one systemd unit, one leader
 * lock, one top-level cycle. Everything that used to run unconditionally in the separate worker
 * process (outgoing delivery, direct-public-write retries) now only runs while this process holds
 * `SCHEDULER_LOCK_KEY`, exactly like the organization sweep and health cadence already did. This
 * is the accepted loss of horizontal delivery scaling (Р-D30а, `docs/OWNER_DECISIONS.md`).
 */
async function startResident(): Promise<void> {
  const runtimeDb = createDbPort();
  await initIntegratorErrorTracking(runtimeDb, 'scheduler');
  await assertSchedulerIsolationTelemetryWriterReady();
  await assertWorkerIsolationTelemetryWriterReady();
  await assertSchedulerPoolReady();
  await assertDeliveryWorkerPoolReady();

  // Advisory lock acquisition happens before any staff/patient/org context exists (pre-buildDeps);
  // when DB_PRINCIPAL_CONTEXT_MODE is locked, the connection layer requires SOME principal to be set
  // before it will touch the DB at all (even for a pg_try_advisory_lock, which isn't RLS-governed
  // data access). infra is the right shape here — same as the actual dispatch tick below.
  let lockHandle: Awaited<ReturnType<typeof tryAcquireSchedulerLock>>;
  try {
    lockHandle = await runWithInfraPrincipal({ source: 'scheduler:acquire-lock', portCapability: 'scheduler' }, () =>
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
  // Two independent DI graphs, exactly as when scheduler and worker were separate processes: the
  // scheduler graph feeds organization ticks/health probes/wakes, the worker graph keeps its own
  // operator-aware delivery-attempt write port for outgoing delivery and direct-write retries.
  const schedulerDeps = buildDeps();
  const schedulerDb = createDbPort();

  const directPublicWriteRetryDb = createDbPort();
  const deliveryDb = createDbPort();
  const deliveryTenantWritePort = createDbWritePort({ db: deliveryDb });
  const deliveryWritePort = createOperatorAwareDeliveryAttemptWritePort({
    db: deliveryDb,
    tenantWritePort: deliveryTenantWritePort,
  });
  const workerDeps = buildDeps({ dispatchAttemptWritePort: deliveryWritePort });
  const batchSize = Math.max(1, Math.trunc(appSettings.runtime.worker.batchSize));

  const digestWakeState = { completedBucket: null as number | null };
  const healthGuardWakeState = { completedBucket: null as number | null };

  logger.info('Scheduler lock acquired, starting resident scheduler+worker loop');

  const lockedTick = createSchedulerLockedTickCoordinator({
    assertLockStillHeld: () => lockHandle.assertStillHeld(),
    runOrganizationTicks: () =>
      runSchedulerOrganizationTicks({
        eventGateway: schedulerDeps.eventGateway,
        listOrganizationIds: () => listSchedulerReminderOrganizationIds(schedulerDb),
        nowIso: () => new Date().toISOString(),
        newEventId: randomUUID,
      }),
    runOutgoingDeliveryTick: () =>
      runOutgoingDeliveryWorkerTick({
        db: deliveryDb,
        writePort: deliveryWritePort,
        dispatchOutgoing: (intent) => workerDeps.dispatchPort.dispatchOutgoing(intent),
        batchSize,
        doctorBroadcastMenu: {
          templatePort: workerDeps.templatePort,
          contentPort: workerDeps.contentPort,
          isTelegramMenuOnButtonPress: workerDeps.isTelegramMenuOnButtonPress,
        },
      }),
    runDirectPublicWriteRetryTick: () =>
      runDirectPublicWriteRetryWorkerTick(directPublicWriteRetryDb, batchSize),
    runOperatorHealthDigestWake: () =>
      runFixedCadenceWake({
        nowMs: Date.now(),
        periodMs: DIGEST_WAKE_PERIOD_MS,
        state: digestWakeState,
        wake: async (wakeId) => {
          const result = await schedulerDeps.webappEventsPort.wakeOperatorHealthDigest?.({ wakeId });
          if (!result?.ok)
            throw new Error(
              `operator_health_digest_wake_failed:${result?.status ?? 0}:${result?.error ?? 'unavailable'}`,
            );
        },
      }),
    runSystemHealthGuardWake: () =>
      runFixedCadenceWake({
        nowMs: Date.now(),
        periodMs: HEALTH_GUARD_WAKE_PERIOD_MS,
        state: healthGuardWakeState,
        wake: async (wakeId) => {
          const result = await schedulerDeps.webappEventsPort.wakeSystemHealthGuard?.({ wakeId });
          if (!result?.ok)
            throw new Error(
              `system_health_guard_wake_failed:${result?.status ?? 0}:${result?.error ?? 'unavailable'}`,
            );
        },
      }),
    runOperatorHealthProbeTick: () =>
      runScheduledOperatorHealthProbeTick({
        dispatchPort: schedulerDeps.dispatchPort,
        loadConfig: getOperatorHealthProbeConfig,
        loadLastRunAt: getOperatorOutboundProbeLastRunAt,
        runProbes: runOperatorHealthProbes,
      }),
    onOrganizationTickError: (err) => {
      captureSchedulerLoopError(err);
      reportSchedulerDispatchIsolationFailure(err);
      logger.error({ err }, 'Runtime scheduler organization tick failed');
    },
    onOutgoingDeliveryTickError: (err) => {
      captureWorkerLoopError(err);
      reportWorkerOutgoingIsolationFailure(err);
      logger.error({ err }, 'Outgoing delivery worker tick failed');
    },
    onDirectPublicWriteRetryTickError: (err) => {
      captureWorkerLoopError(err);
      reportWorkerProjectionIsolationFailure(err);
      logger.error({ err }, 'Direct public write retry worker tick failed');
    },
  });

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
      await lockedTick.runTick();
    } catch (err) {
      if (err instanceof SchedulerLockLostError) {
        logger.error(
          { err },
          'Scheduler lost its advisory lock mid-loop; exiting so systemd restarts and re-races for leadership',
        );
        reportSchedulerLockIsolationFailure(err);
        await releaseLock().catch((releaseErr) =>
          logger.error(
            { err: releaseErr },
            'Failed to release scheduler lock during lock-loss shutdown',
          ),
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

startResident().catch(async (err) => {
  captureSchedulerStartupFatal(err);
  reportSchedulerDispatchIsolationFailure(err);
  reportWorkerQueueIsolationFailure(err);
  logger.error({ err }, 'Runtime scheduler crashed');
  await closeIntegratorErrorTracking();
  process.exitCode = 1;
});
