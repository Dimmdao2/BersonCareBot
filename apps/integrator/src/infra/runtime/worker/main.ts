import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { env } from '../../../config/env.js';
import { createWebappEventsPort } from '../../adapters/webappEventsClient.js';
import { createDbPort } from '../../db/client.js';
import { logger } from '../../observability/logger.js';
import { createDbWritePort } from '../../db/writePort.js';
import { runProjectionWorkerTick } from './projectionWorker.js';
import { runDirectPublicWriteRetryWorkerTick } from './directPublicWriteRetryWorker.js';
import { runOutgoingDeliveryWorkerTick } from './outgoingDeliveryWorker.js';
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
  const directPublicWriteRetryDb = createDbPort();
  const deliveryDb = createDbPort();
  const deliveryTenantWritePort = createDbWritePort({ db: deliveryDb });
  const deliveryWritePort = createOperatorAwareDeliveryAttemptWritePort({
    db: deliveryDb,
    tenantWritePort: deliveryTenantWritePort,
  });
  const { buildDeps } = await import('../../../app/di.js');
  const deps = buildDeps({
    dispatchAttemptWritePort: deliveryWritePort,
  });
  const webappEvents = createWebappEventsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const batchSize = Math.max(1, Math.trunc(appSettings.runtime.worker.batchSize));

  logger.info('Runtime worker started');

  const pollIntervalMs = appSettings.runtime.worker.pollIntervalMs;

  // Projection, direct-write retries and outgoing delivery have separate queues. All delivery rows are
  // claimed only by the outgoing-delivery loop; direct-write retries never use HTTP projection transport.
  await Promise.all([
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
    (async function directPublicWriteRetryLoop(): Promise<void> {
      while (true) {
        try {
          await runDirectPublicWriteRetryWorkerTick(directPublicWriteRetryDb, batchSize);
        } catch (err) {
          captureWorkerLoopError(err);
          reportWorkerProjectionIsolationFailure(err);
          logger.error({ err }, 'Direct public write retry worker tick failed');
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
