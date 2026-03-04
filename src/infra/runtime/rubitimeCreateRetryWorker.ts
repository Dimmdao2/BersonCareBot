import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { appSettings } from '../../config/appSettings.js';
import {
  claimDueRubitimeCreateRetryJobs,
  completeRubitimeCreateRetryJob,
  rescheduleRubitimeCreateRetryJob,
} from '../db/repos/rubitimeCreateRetryJobs.js';
import { findByPhone } from '../db/repos/telegramUsers.js';
import { logger } from '../observability/logger.js';

const CLAIM_BATCH_SIZE = 25;

function buildTelegramIntent(input: {
  phoneNormalized: string;
  messageText: string;
  chatId: number;
  eventId: string;
}): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: input.eventId,
      occurredAt: new Date().toISOString(),
      source: 'worker',
    },
    payload: {
      recipient: {
        phoneNormalized: input.phoneNormalized,
        chatId: input.chatId,
      },
      message: { text: input.messageText },
      delivery: {
        channels: ['telegram'],
        maxAttempts: 1,
      },
    },
  };
}

function buildSmsIntent(input: {
  phoneNormalized: string;
  messageText: string;
  eventId: string;
}): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: input.eventId,
      occurredAt: new Date().toISOString(),
      source: 'worker',
    },
    payload: {
      recipient: {
        phoneNormalized: input.phoneNormalized,
      },
      message: { text: input.messageText },
      delivery: {
        channels: ['smsc'],
        maxAttempts: 1,
      },
    },
  };
}

export async function runRubitimeCreateRetryIteration(dispatchPort: DispatchPort): Promise<void> {
  const jobs = await claimDueRubitimeCreateRetryJobs(CLAIM_BATCH_SIZE);
  if (jobs.length === 0) return;

  for (const job of jobs) {
    try {
      const telegramUser = await findByPhone(job.phoneNormalized);
      if (telegramUser) {
        await dispatchPort.dispatchOutgoing(buildTelegramIntent({
          phoneNormalized: job.phoneNormalized,
          messageText: job.messageText,
          chatId: telegramUser.chatId,
          eventId: `rubitime:create-retry:${job.id}:telegram`,
        }));
        await completeRubitimeCreateRetryJob(job.id);
        continue;
      }

      const nextAttempt = job.attemptsDone + 1;
      if (nextAttempt < job.maxAttempts) {
        await rescheduleRubitimeCreateRetryJob({
          id: job.id,
          attemptsDone: nextAttempt,
          retryDelaySeconds: appSettings.rubitime.createRecordDelivery.retryDelaySeconds,
        });
        continue;
      }

      await dispatchPort.dispatchOutgoing(buildSmsIntent({
        phoneNormalized: job.phoneNormalized,
        messageText: job.messageText,
        eventId: `rubitime:create-retry:${job.id}:smsc`,
      }));
      await completeRubitimeCreateRetryJob(job.id);
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'rubitime create-retry job failed');
      await rescheduleRubitimeCreateRetryJob({
        id: job.id,
        attemptsDone: job.attemptsDone,
        retryDelaySeconds: appSettings.rubitime.createRecordDelivery.retryDelaySeconds,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
