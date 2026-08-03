import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { env } from '../../../config/env.js';
import { createPostgresJobQueue } from '../../adapters/jobQueuePort.js';
import { createWebappEventsPort } from '../../adapters/webappEventsClient.js';
import { createDbPort } from '../../db/client.js';
import { logger } from '../../observability/logger.js';
import { createDbWritePort } from '../../db/writePort.js';
import { getOutgoingDeliveryReclaimConfig } from '../../db/repos/outgoingDeliveryReclaimSettings.js';
import { PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS } from '../../../kernel/domain/reminders/patientNotificationTopics.js';
import { runWorkerTick } from './runner.js';
import { assertWebappPushNotifyAccepted } from './jobExecutor.js';
import { runProjectionWorkerTick } from './projectionWorker.js';
import { runOutgoingDeliveryWorkerTick } from './outgoingDeliveryWorker.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import {
  assertWorkerIsolationTelemetryWriterReady,
  reportWorkerOutgoingIsolationFailure,
  reportWorkerProjectionIsolationFailure,
  reportWorkerQueueIsolationFailure,
} from '../../observability/saasIsolationTelemetry.js';
import { assertDeliveryWorkerPoolReady } from '../../db/operationalPoolReadiness.js';
import { createOperatorAwareDeliveryAttemptWritePort } from './operatorDeliveryAttemptWritePort.js';
import {
  captureWorkerLoopError,
  captureWorkerStartupFatal,
  closeIntegratorErrorTracking,
  initIntegratorErrorTracking,
} from '../../observability/errorTracking.js';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker(): Promise<void> {
  const runtimeDb = createDbPort();
  await initIntegratorErrorTracking(runtimeDb, 'worker');
  await assertWorkerIsolationTelemetryWriterReady();
  await assertDeliveryWorkerPoolReady();
  const projectionDb = createDbPort();
  const deliveryDb = createDbPort();
  const deliveryWritePort = createDbWritePort({ db: deliveryDb });
  const { buildDeps } = await import('../../../app/di.js');
  const deps = buildDeps({
    dispatchAttemptWritePort: createOperatorAwareDeliveryAttemptWritePort({
      db: deliveryDb,
      tenantWritePort: deliveryWritePort,
    }),
  });
  const webappEvents = createWebappEventsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const queueDb = createDbPort();
  const queue = createPostgresJobQueue({
    db: queueDb,
    retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
  });
  const batchSize = Math.max(1, Math.trunc(appSettings.runtime.worker.batchSize));

  logger.info('Runtime worker started');

  const pollIntervalMs = appSettings.runtime.worker.pollIntervalMs;

  // Job queue and projection outbox run on separate loops so a long job drain cannot starve projection delivery (Stage13 C4).
  await Promise.all([
    (async function jobQueueLoop(): Promise<void> {
      while (true) {
        try {
          // Claim + queue bookkeeping is tenant-agnostic dispatch (rows were already org-filtered
          // at enqueue time); wrap the whole drain cycle in infra when DB_PRINCIPAL_CONTEXT_MODE is locked, so it
          // doesn't reject the claim query before per-job dispatch gets a chance to install its own
          // org principal deeper in the executor pipeline.
          await runWithInfraPrincipal({ source: 'worker:job-queue-drain' }, async () => {
            // Sh7 drain: old appointment rows may have been left `processing` when a former
            // worker died. Return only an expired lease to pending; the compatible consumer keeps
            // their persisted ladder, Web Push sibling and first-success semantics intact.
            const reclaimConfig = await getOutgoingDeliveryReclaimConfig(queueDb);
            await queue.reclaimStaleProcessing(reclaimConfig.processingTimeoutMinutes);
            while (true) {
              const jobs = await queue.claimDueJobs(batchSize);
              if (jobs.length === 0) break;
              for (const job of jobs) {
                const tickDeps: import('./runner.js').WorkerRunnerDeps = {
                  claimNextJob: async () => job,
                  completeJob: async (jobId) => queue.completeJob(jobId),
                  failJob: async (jobId, errorCode) =>
                    queue.failJob(jobId, { ok: false, errorCode, final: true }),
                  rescheduleJob: async (jobId, runAt, attempts) =>
                    queue.rescheduleJob(jobId, runAt, attempts),
                  logAttempt: async (jobId, result) => queue.logAttempt(jobId, result),
                  dispatchOutgoing: (intent) => deps.dispatchPort.dispatchOutgoing(intent),
                  nowIso: () => new Date().toISOString(),
                  retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
                };
                if (webappEvents.notifyPatientWebPush) {
                  const notify = webappEvents.notifyPatientWebPush.bind(webappEvents);
                  tickDeps.dispatchWebappPush = async (pushNotify) => {
                    const base = env.APP_BASE_URL.replace(/\/$/, '');
                    const body = JSON.stringify({
                      organizationId: pushNotify.organizationId,
                      phoneNormalized: pushNotify.phoneNormalized,
                      topicCode: PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS,
                      intentType: 'appointment_reminder',
                      slotStartIso: pushNotify.slotStartIso,
                      openUrl: `${base}/app/patient/booking`,
                      stableKey: pushNotify.stableKey,
                      nowIso: new Date().toISOString(),
                    });
                    const result = await notify({
                      body,
                      idempotencyKey: `pwp:${pushNotify.stableKey}`.slice(0, 240),
                    });
                    assertWebappPushNotifyAccepted(result);
                  };
                }
                await runWorkerTick(tickDeps);
              }
            }
          });
        } catch (err) {
          captureWorkerLoopError(err);
          reportWorkerQueueIsolationFailure(err);
          logger.error({ err }, 'Runtime worker tick failed');
        }
        await sleep(pollIntervalMs);
      }
    })(),
    (async function projectionOutboxLoop(): Promise<void> {
      while (true) {
        try {
          await runProjectionWorkerTick(projectionDb, webappEvents);
        } catch (err) {
          captureWorkerLoopError(err);
          reportWorkerProjectionIsolationFailure(err);
          logger.error({ err }, 'Projection worker tick failed');
        }
        await sleep(pollIntervalMs);
      }
    })(),
    (async function outgoingDeliveryLoop(): Promise<void> {
      while (true) {
        try {
          await runOutgoingDeliveryWorkerTick({
            db: deliveryDb,
            writePort: deliveryWritePort,
            dispatchOutgoing: (intent) => deps.dispatchPort.dispatchOutgoing(intent),
            batchSize,
            doctorBroadcastMenu: {
              templatePort: deps.templatePort,
              contentPort: deps.contentPort,
              isTelegramMenuOnButtonPress: deps.isTelegramMenuOnButtonPress,
            },
          });
        } catch (err) {
          captureWorkerLoopError(err);
          reportWorkerOutgoingIsolationFailure(err);
          logger.error({ err }, 'Outgoing delivery worker tick failed');
        }
        await sleep(pollIntervalMs);
      }
    })(),
  ]);
}

const closeOnSignal = (): void => {
  void closeIntegratorErrorTracking().finally(() => process.exit(0));
};
process.once('SIGINT', closeOnSignal);
process.once('SIGTERM', closeOnSignal);

startWorker().catch(async (err) => {
  captureWorkerStartupFatal(err);
  reportWorkerQueueIsolationFailure(err);
  logger.error({ err }, 'Runtime worker crashed');
  await closeIntegratorErrorTracking();
  process.exitCode = 1;
});
