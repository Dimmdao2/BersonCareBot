import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { appSettings } from './config/appSettings.js';
import type { DeliveryJob } from './kernel/contracts/index.js';
import type { ActionResult, DomainContext } from './kernel/contracts/index.js';
import { runSchedulerTick, runWorkerTick as runRuntimeWorkerTick } from './runtime/index.js';
import {
  claimDueRubitimeCreateRetryJobs,
  completeRubitimeCreateRetryJob,
  rescheduleRubitimeCreateRetryJob,
} from './infra/db/repos/rubitimeCreateRetryJobs.js';
import { findByPhone } from './infra/db/repos/telegramUsers.js';

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: '/opt/tgcarebot/.env' });
} else {
  dotenv.config();
}

function parseDbJobId(jobId: string): number | null {
  const [, idRaw] = jobId.split(':');
  const parsed = Number(idRaw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildContextForJob(job: DeliveryJob): DomainContext {
  return {
    event: {
      type: 'schedule.tick',
      meta: {
        eventId: `worker:${job.id}`,
        occurredAt: new Date().toISOString(),
        source: 'worker',
      },
      payload: {
        jobId: job.id,
        kind: job.kind,
      },
    },
    nowIso: new Date().toISOString(),
    values: {},
  };
}

async function executeRubitimeRetryJob(actionParams: Record<string, unknown>, dispatchOutgoing: (intent: {
  type: 'message.send';
  meta: { eventId: string; occurredAt: string; source: string };
  payload: Record<string, unknown>;
}) => Promise<void>): Promise<ActionResult> {
  const phoneNormalized = typeof actionParams.phoneNormalized === 'string'
    ? actionParams.phoneNormalized
    : null;
  const messageText = typeof actionParams.messageText === 'string'
    ? actionParams.messageText
    : null;
  const attempts = typeof actionParams.attempts === 'number' && Number.isFinite(actionParams.attempts)
    ? Math.max(0, Math.trunc(actionParams.attempts))
    : 0;
  const maxAttempts = typeof actionParams.maxAttempts === 'number' && Number.isFinite(actionParams.maxAttempts)
    ? Math.max(1, Math.trunc(actionParams.maxAttempts))
    : 1;
  const dbJobId = typeof actionParams.dbJobId === 'number' && Number.isFinite(actionParams.dbJobId)
    ? Math.trunc(actionParams.dbJobId)
    : null;

  if (!phoneNormalized || !messageText || dbJobId === null) {
    return {
      actionId: `job:${dbJobId ?? 'unknown'}`,
      status: 'failed',
      error: 'INVALID_RETRY_JOB_PAYLOAD',
    };
  }

  try {
    const telegramUser = await findByPhone(phoneNormalized);
    if (telegramUser) {
      await dispatchOutgoing({
        type: 'message.send',
        meta: {
          eventId: `rubitime:create-retry:${dbJobId}:telegram`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          recipient: {
            phoneNormalized,
            chatId: telegramUser.chatId,
          },
          message: { text: messageText },
          delivery: {
            channels: ['telegram'],
            maxAttempts: 1,
          },
        },
      });
      return { actionId: `job:${dbJobId}`, status: 'success' };
    }

    const nextAttempt = attempts + 1;
    if (nextAttempt >= maxAttempts) {
      await dispatchOutgoing({
        type: 'message.send',
        meta: {
          eventId: `rubitime:create-retry:${dbJobId}:smsc`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          recipient: {
            phoneNormalized,
          },
          message: { text: messageText },
          delivery: {
            channels: ['smsc'],
            maxAttempts: 1,
          },
        },
      });
      return { actionId: `job:${dbJobId}`, status: 'success' };
    }

    return { actionId: `job:${dbJobId}`, status: 'failed' };
  } catch (error) {
    return {
      actionId: `job:${dbJobId}`,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
  const { buildDeps } = await import('./app/di.js');
  const { logger } = await import('./infra/observability/logger.js');

  const deps = buildDeps();
  const runtimeQueue: DeliveryJob[] = [];
  logger.info('Worker started');

  while (true) {
    try {
      await runSchedulerTick(
        {
          async claimDueScheduledJobs(_nowIso, limit) {
            const rows = await claimDueRubitimeCreateRetryJobs(limit);
            return rows.map((row) => ({
              id: `rubitime-create-retry:${row.id}`,
              kind: 'rubitime.create_retry.delivery',
              runAt: new Date().toISOString(),
              attempts: row.attemptsDone,
              maxAttempts: row.maxAttempts,
              payload: {
                dbJobId: row.id,
                phoneNormalized: row.phoneNormalized,
                messageText: row.messageText,
                attempts: row.attemptsDone,
                maxAttempts: row.maxAttempts,
              },
            }));
          },
          async enqueueRuntimeJob(job) {
            runtimeQueue.push(job);
          },
          async markScheduledAsQueued() {
            // claimed rows are already marked as processing in DB
          },
        },
        new Date().toISOString(),
      );

      while (true) {
        const status = await runRuntimeWorkerTick({
          async claimNextJob() {
            return runtimeQueue.shift() ?? null;
          },
          async completeJob(jobId) {
            const dbJobId = parseDbJobId(jobId);
            if (dbJobId !== null) {
              await completeRubitimeCreateRetryJob(dbJobId);
            }
          },
          async rescheduleJob(jobId, _runAt, attempts) {
            const dbJobId = parseDbJobId(jobId);
            if (dbJobId !== null) {
              await rescheduleRubitimeCreateRetryJob({
                id: dbJobId,
                attemptsDone: attempts,
                retryDelaySeconds: appSettings.rubitime.createRecordDelivery.retryDelaySeconds,
              });
            }
          },
          async buildContext(job) {
            return buildContextForJob(job);
          },
          async executeAction(action) {
            return executeRubitimeRetryJob(action.params, (intent) => deps.dispatchPort.dispatchOutgoing(intent));
          },
          retryDelaySeconds: appSettings.rubitime.createRecordDelivery.retryDelaySeconds,
        });
        if (status === 'idle') break;
      }

      await deps.eventGateway.handleIncomingEvent({
        type: 'schedule.tick',
        meta: {
          eventId: `wrk:${randomUUID()}`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          trigger: 'schedule.tick',
        },
      });
    } catch (err) {
      logger.error({ err }, 'Worker tick failed');
    }
    await sleep(appSettings.worker.pollIntervalMs);
  }
}

startWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
