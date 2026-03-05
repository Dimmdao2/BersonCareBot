import type { DbPort, DeliveryAttemptResult, DeliveryJob, JobQueuePort, QueuePort } from '../../kernel/contracts/index.js';
import {
  claimDueMessageRetryJobs,
  completeMessageRetryJob,
  enqueueMessageRetryJob,
  failMessageRetryJob,
  rescheduleMessageRetryJob,
} from '../db/repos/jobQueue.js';

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
  const channel = 'phone';
  return {
    id: `message-retry:${row.id}`,
    jobId: `message-retry:${row.id}`,
    kind: 'message.deliver',
    createdAt: new Date().toISOString(),
    status: 'processing',
    attemptsMade: row.attemptsDone,
    runAt: new Date().toISOString(),
    attempts: row.attemptsDone,
    maxAttempts: row.maxAttempts,
    plan: [
      { stageId: 'stage:1', channel, maxAttempts: row.maxAttempts },
    ],
    targets: [
      {
        resource: channel,
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
          eventId: `message-retry:${row.id}:${channel}`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          message: { text: row.messageText },
          delivery: {
            channels: [channel],
            maxAttempts: 1,
          },
        },
      },
      targets: [
        {
          resource: channel,
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

export type PostgresJobQueue = QueuePort & JobQueuePort;

export function createPostgresJobQueue(input: { db: DbPort; retryDelaySeconds: number }): PostgresJobQueue {
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
      const targetWithPhone = targets.find((target) => typeof target.address?.phoneNormalized === 'string');
      const phoneNormalized = typeof targetWithPhone?.address?.phoneNormalized === 'string'
        ? targetWithPhone.address.phoneNormalized
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

      await enqueueMessageRetryJob(input.db, {
        phoneNormalized,
        messageText,
        firstTryDelaySeconds,
        maxAttempts,
      });
    },

    async claimDueJobs(limit: number): Promise<DeliveryJob[]> {
      const rows = await claimDueMessageRetryJobs(input.db, limit);
      return rows.map(toDeliveryJob);
    },

    async completeJob(jobId: string): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      await completeMessageRetryJob(input.db, dbJobId);
    },

    async failJob(jobId: string, result: DeliveryAttemptResult): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      const failInput: { id: number; lastError?: string } = {
        id: dbJobId,
        ...(result.errorCode ? { lastError: result.errorCode } : {}),
      };
      await failMessageRetryJob(input.db, failInput);
    },

    async rescheduleJob(jobId: string, _nextRunAt: string, attemptsMade: number): Promise<void> {
      const dbJobId = parseDbJobId(jobId);
      if (dbJobId === null) return;
      await rescheduleMessageRetryJob(input.db, {
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
