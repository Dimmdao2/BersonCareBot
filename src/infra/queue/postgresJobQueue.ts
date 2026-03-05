import type { DeliveryAttemptResult, DeliveryJob, QueuePort } from '../../kernel/contracts/index.js';
import {
  claimDueRubitimeCreateRetryJobs,
  completeRubitimeCreateRetryJob,
  enqueueRubitimeCreateRetryJob,
  failRubitimeCreateRetryJob,
  rescheduleRubitimeCreateRetryJob,
} from '../db/repos/rubitimeCreateRetryJobs.js';
import type { WorkerJobQueuePort } from '../../runtime/worker/jobQueuePort.js';

function parseDbJobId(jobId: string): number | null {
  const [, idRaw] = jobId.split(':');
  const parsed = Number(idRaw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toDeliveryJob(row: {
  id: number;
  phoneNormalized: string;
  messageText: string;
  attemptsDone: number;
  maxAttempts: number;
}): DeliveryJob {
  return {
    id: `rubitime-create-retry:${row.id}`,
    jobId: `rubitime-create-retry:${row.id}`,
    kind: 'message.deliver',
    createdAt: new Date().toISOString(),
    status: 'processing',
    attemptsMade: row.attemptsDone,
    runAt: new Date().toISOString(),
    attempts: row.attemptsDone,
    maxAttempts: row.maxAttempts,
    plan: [
      { stageId: 'stage:1', channel: 'smsc', maxAttempts: row.maxAttempts },
    ],
    targets: [
      {
        resource: 'smsc',
        address: {
          phoneNormalized: row.phoneNormalized,
        },
      },
    ],
    retry: {
      maxAttempts: row.maxAttempts,
      backoffSeconds: [],
    },
    payload: {
      intent: {
        type: 'message.send',
        meta: {
          eventId: `rubitime:create-retry:${row.id}:smsc`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          message: { text: row.messageText },
          delivery: {
            channels: ['smsc'],
            maxAttempts: 1,
          },
        },
      },
      targets: [
        {
          resource: 'smsc',
          address: { phoneNormalized: row.phoneNormalized },
        },
      ],
      retry: {
        maxAttempts: row.maxAttempts,
        backoffSeconds: [],
      },
    },
  };
}

export type PostgresJobQueue = QueuePort & WorkerJobQueuePort;

export function createPostgresJobQueue(input: { retryDelaySeconds: number }): PostgresJobQueue {
  return {
    async enqueue(task): Promise<void> {
      const payload = task.payload;
      const intent = typeof payload.intent === 'object' && payload.intent !== null
        ? payload.intent as { payload?: { message?: { text?: unknown } }; }
        : null;
      const messageText = typeof intent?.payload?.message?.text === 'string'
        ? intent.payload.message.text
        : null;
      const targets = Array.isArray(payload.targets)
        ? payload.targets as Array<{ resource?: unknown; address?: { phoneNormalized?: unknown } }>
        : [];
      const smsTarget = targets.find((target) => target.resource === 'smsc');
      const phoneNormalized = typeof smsTarget?.address?.phoneNormalized === 'string'
        ? smsTarget.address.phoneNormalized
        : null;
      if (!messageText || !phoneNormalized) return;

      const retry = typeof payload.retry === 'object' && payload.retry !== null
        ? payload.retry as { maxAttempts?: unknown; backoffSeconds?: unknown }
        : {};
      const maxAttempts = typeof retry.maxAttempts === 'number' && Number.isFinite(retry.maxAttempts)
        ? Math.max(1, Math.trunc(retry.maxAttempts))
        : 2;
      const firstTryDelaySeconds = Array.isArray(retry.backoffSeconds)
        ? (typeof retry.backoffSeconds[0] === 'number' && Number.isFinite(retry.backoffSeconds[0])
          ? Math.max(0, Math.trunc(retry.backoffSeconds[0]))
          : input.retryDelaySeconds)
        : input.retryDelaySeconds;

      await enqueueRubitimeCreateRetryJob({
        phoneNormalized,
        messageText,
        firstTryDelaySeconds,
        maxAttempts,
      });
    },

    async claimDueJobs(limit: number): Promise<DeliveryJob[]> {
      const rows = await claimDueRubitimeCreateRetryJobs(limit);
      return rows.map(toDeliveryJob);
    },

    async completeJob(jobId: string): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      await completeRubitimeCreateRetryJob(dbJobId);
    },

    async failJob(jobId: string, result: DeliveryAttemptResult): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      const failInput: { id: number; lastError?: string } = {
        id: dbJobId,
        ...(result.errorCode ? { lastError: result.errorCode } : {}),
      };
      await failRubitimeCreateRetryJob(failInput);
    },

    async rescheduleJob(jobId: string, _nextRunAt: string, attemptsMade: number): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      await rescheduleRubitimeCreateRetryJob({
        id: dbJobId,
        attemptsDone: attemptsMade,
        retryDelaySeconds: input.retryDelaySeconds,
      });
    },

    async logAttempt(_jobId: string, _result: DeliveryAttemptResult): Promise<void> {
      // technical attempt log goes to DbWritePort delivery.attempt.log when required
    },
  };
}
