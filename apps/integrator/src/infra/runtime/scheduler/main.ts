import { randomUUID } from 'node:crypto';
import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { logger } from '../../observability/logger.js';
import { closeDb, createDbPort } from '../../db/client.js';
import { createDbWritePort } from '../../db/writePort.js';
import { SchedulerLockLostError, tryAcquireSchedulerLock } from '../../db/repos/schedulerLocks.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { runFixedCadenceWake } from './fixedCadenceWake.js';
import {
  createSchedulerLockedTickCoordinator,
  SchedulerCadenceStepError,
} from './schedulerLockedTick.js';
import {
  assertSchedulerIsolationTelemetryWriterReady,
  assertWorkerIsolationTelemetryWriterReady,
  reportSchedulerDispatchIsolationFailure,
  reportSchedulerLockIsolationFailure,
  reportWorkerOutgoingIsolationFailure,
  reportWorkerQueueIsolationFailure,
} from '../../observability/saasIsolationTelemetry.js';
import { assertDeliveryWorkerPoolReady, assertSchedulerPoolReady } from '../../db/operationalPoolReadiness.js';
import { listSchedulerReminderOrganizationIds } from '../../db/repos/schedulerReminderOrganizations.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';
import { runOperatorHealthProbes } from '../../../app/operatorHealthProbeRunner.js';
import { getOperatorHealthProbeConfig } from '../../../app/operatorHealthProbeSettings.js';
import { getOperatorOutboundProbeLastRunAt } from '../../db/repos/operatorHealthDrizzle.js';
import { runScheduledOperatorHealthProbeTick } from './operatorHealthProbeTick.js';
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
 * process (outgoing delivery) now only runs while this process holds `SCHEDULER_LOCK_KEY`, exactly
 * like the organization sweep and health cadence already did. This is the accepted loss of
 * horizontal delivery scaling (Р-D30а, `docs/OWNER_DECISIONS.md`). Track D final cutover (#987)
 * retired the separate direct-public-write retry tick entirely — the occurrence writes it used to
 * repair now land in one atomic UPDATE with no second schema to fall behind.
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
  // scheduler graph feeds organization ticks/health probes/wakes, the worker graph passes its own
  // operator-aware delivery-attempt write port directly to the outgoing-delivery tick (below) — the
  // real failed-provider-attempt write for a queue-backed reminder/broadcast/alert happens there,
  // tied to the queue row (skipAttemptLog: true below opts dispatchPort's own write out for exactly
  // this call). Every other (non-queue-backed) dispatchOutgoing caller still gets a real attempt
  // row written by dispatchPort itself.
  const schedulerDeps = buildDeps();
  const schedulerDb = createDbPort();

  const deliveryDb = createDbPort();
  const deliveryTenantWritePort = createDbWritePort({ db: deliveryDb });
  const deliveryWritePort = createOperatorAwareDeliveryAttemptWritePort({
    db: deliveryDb,
    tenantWritePort: deliveryTenantWritePort,
  });
  const workerDeps = buildDeps();
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
        // skipAttemptLog: this tick already records the one real failed attempt itself
        // (handleDispatchFailure, with the real queue row id and real attempt count) — dispatchPort
        // recording its own cruder attempt too would duplicate the operator journal entry.
        dispatchOutgoing: (intent) =>
          workerDeps.dispatchPort.dispatchOutgoing(intent, { skipAttemptLog: true }),
        batchSize,
        doctorBroadcastMenu: {
          templatePort: workerDeps.templatePort,
          contentPort: workerDeps.contentPort,
          isTelegramMenuOnButtonPress: workerDeps.isTelegramMenuOnButtonPress,
        },
      }),
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
      logger.error(
        {
          err,
          cadenceStep: err instanceof SchedulerCadenceStepError ? err.step : 'unknown',
        },
        'Runtime scheduler tick failed',
      );
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
