import type { DbWriteMutation, DbWritePort } from '../../kernel/contracts/index.js';
import { upsertRecord, insertEvent } from './repos/rubitimeRecords.js';
import { setTelegramUserPhone, setTelegramUserState } from './repos/telegramUsers.js';
import { appendMessageLog } from './repos/messageLogs.js';
import { enqueueRubitimeCreateRetryJob } from './repos/rubitimeCreateRetryJobs.js';
import { logger } from '../observability/logger.js';

type BookingUpsertParams = {
  rubitimeRecordId?: unknown;
  phoneNormalized?: unknown;
  recordAt?: unknown;
  status?: unknown;
  payloadJson?: unknown;
  lastEvent?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Creates the default DbWritePort implementation used by eventGateway.
 * It maps canonical write mutations to existing infra repositories.
 */
export function createDbWritePort(): DbWritePort {
  return {
    async writeDb(mutation: DbWriteMutation): Promise<void> {
      switch (mutation.type) {
        case 'booking.upsert': {
          const params = mutation.params as BookingUpsertParams;
          const rubitimeRecordId = asNonEmptyString(params.rubitimeRecordId);
          if (!rubitimeRecordId) {
            logger.warn({ mutationType: mutation.type }, 'skip booking.upsert: missing rubitimeRecordId');
            return;
          }
          const statusRaw = asNonEmptyString(params.status);
          const status = statusRaw === 'created' || statusRaw === 'updated' || statusRaw === 'canceled'
            ? statusRaw
            : 'updated';
          await upsertRecord({
            rubitimeRecordId,
            phoneNormalized: asNullableString(params.phoneNormalized),
            recordAt: asNullableString(params.recordAt),
            status,
            payloadJson: params.payloadJson ?? {},
            lastEvent: asNonEmptyString(params.lastEvent) ?? 'unknown',
          });
          return;
        }
        case 'event.log': {
          // For Rubitime events we persist a raw webhook journal entry.
          const source = asNonEmptyString(mutation.params.source);
          const body = mutation.params.body;
          const bodyObj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
          const data = bodyObj?.data;
          const dataObj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
          if (source === 'rubitime') {
            await insertEvent({
              rubitimeRecordId: asNullableString(dataObj?.id),
              event: asNonEmptyString(bodyObj?.event) ?? 'unknown',
              payloadJson: bodyObj ?? {},
            });
            return;
          }
          await appendMessageLog(mutation);
          return;
        }
        case 'user.state.set': {
          const telegramId = asNonEmptyString(mutation.params.telegramId);
          if (!telegramId) return;
          await setTelegramUserState(telegramId, asNullableString(mutation.params.state));
          return;
        }
        case 'user.phone.link': {
          const telegramId = asNonEmptyString(mutation.params.telegramId);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          if (!telegramId || !phoneNormalized) return;
          await setTelegramUserPhone(telegramId, phoneNormalized);
          return;
        }
        case 'delivery.attempt.log':
        case 'user.upsert': {
          if (mutation.type === 'delivery.attempt.log') {
            logger.info({ params: mutation.params }, 'delivery attempt log');
          }
          await appendMessageLog(mutation);
          return;
        }
        case 'rubitime.create_retry.enqueue': {
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          const messageText = asNonEmptyString(mutation.params.messageText);
          if (!phoneNormalized || !messageText) {
            logger.warn(
              { mutationType: mutation.type },
              'skip rubitime.create_retry.enqueue: missing phone/message',
            );
            return;
          }
          const firstTryDelaySecondsRaw = mutation.params.firstTryDelaySeconds;
          const maxAttemptsRaw = mutation.params.maxAttempts;
          const firstTryDelaySeconds = typeof firstTryDelaySecondsRaw === 'number' && Number.isFinite(firstTryDelaySecondsRaw)
            ? Math.max(0, Math.trunc(firstTryDelaySecondsRaw))
            : 60;
          const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
            ? Math.max(1, Math.trunc(maxAttemptsRaw))
            : 2;

          await enqueueRubitimeCreateRetryJob({
            phoneNormalized,
            messageText,
            firstTryDelaySeconds,
            maxAttempts,
          });
          return;
        }
        default: {
          logger.warn({ mutationType: mutation.type }, 'unsupported DbWriteMutation type');
        }
      }
    },
  };
}
