import '../../../config/loadEnv.js';
import { appSettings } from '../../../config/appSettings.js';
import { createPostgresJobQueue } from '../../adapters/jobQueuePort.js';
import { getAppBaseUrl } from '../../../config/appBaseUrl.js';
import { createWebappEventsPort } from '../../adapters/webappEventsClient.js';
import { createDbPort } from '../../db/client.js';
import { logger } from '../../observability/logger.js';
import { runWorkerTick } from './runner.js';
import { runProjectionWorkerTick } from './projectionWorker.js';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker(): Promise<void> {
  const { buildDeps } = await import('../../../app/di.js');
  const deps = buildDeps();
  const projectionDb = createDbPort();
  const webappEvents = createWebappEventsPort({
    getAppBaseUrl: () => getAppBaseUrl(projectionDb),
  });
  const queue = createPostgresJobQueue({
    db: createDbPort(),
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
          while (true) {
            const jobs = await queue.claimDueJobs(batchSize);
            if (jobs.length === 0) break;
            for (const job of jobs) {
              await runWorkerTick({
                claimNextJob: async () => job,
                completeJob: async (jobId) => queue.completeJob(jobId),
                failJob: async (jobId, errorCode) => queue.failJob(jobId, { ok: false, errorCode, final: true }),
                rescheduleJob: async (jobId, runAt, attempts) => queue.rescheduleJob(jobId, runAt, attempts),
                logAttempt: async (jobId, result) => queue.logAttempt(jobId, result),
                dispatchOutgoing: (intent) => deps.dispatchPort.dispatchOutgoing(intent),
                nowIso: () => new Date().toISOString(),
                retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
              });
            }
          }
        } catch (err) {
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
          logger.error({ err }, 'Projection worker tick failed');
        }
        await sleep(pollIntervalMs);
      }
    })(),
  ]);
}

startWorker().catch((err) => {
  logger.error({ err }, 'Runtime worker crashed');
  process.exit(1);
});
