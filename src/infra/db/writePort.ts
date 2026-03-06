import type { DbPort, DbWriteMutation, DbWritePort } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { upsertRecord, insertEvent } from './repos/bookingRecords.js';
import { setUserPhone, setUserState, updateNotificationSettings } from './repos/channelUsers.js';
import { appendMessageLog } from './repos/messageLogs.js';
import { enqueueMessageRetryJob } from './repos/jobQueue.js';
import { logger } from '../observability/logger.js';

type BookingUpsertParams = {
  externalRecordId?: unknown;
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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const stringValue = asNonEmptyString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function readChannelUserId(params: Record<string, unknown>): string | null {
  return asNonEmptyString(params.channelUserId ?? params.channelId);
}

/**
 * Creates the default DbWritePort implementation used by eventGateway.
 * It maps canonical write mutations to existing infra repositories.
 */
export function createDbWritePort(input: { db?: DbPort } = {}): DbWritePort {
  const db = input.db ?? createDbPort();
  return {
    async writeDb(mutation: DbWriteMutation): Promise<void> {
      switch (mutation.type) {
        case 'booking.upsert': {
          const params = mutation.params as BookingUpsertParams;
          const externalRecordId = asNonEmptyString(params.externalRecordId);
          if (!externalRecordId) {
            logger.warn({ mutationType: mutation.type }, 'skip booking.upsert: missing externalRecordId');
            return;
          }
          const statusRaw = asNonEmptyString(params.status);
          const status = statusRaw === 'created' || statusRaw === 'updated' || statusRaw === 'canceled'
            ? statusRaw
            : 'updated';
          await upsertRecord(db, {
            externalRecordId,
            phoneNormalized: asNullableString(params.phoneNormalized),
            recordAt: asNullableString(params.recordAt),
            status,
            payloadJson: params.payloadJson ?? {},
            lastEvent: asNonEmptyString(params.lastEvent) ?? 'unknown',
          });
          return;
        }
        case 'event.log': {
          const eventStore = asNonEmptyString(mutation.params.eventStore);
          const body = mutation.params.body;
          const bodyObj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
          const data = bodyObj?.data;
          const dataObj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
          if (eventStore === 'booking') {
            await insertEvent(db, {
              externalRecordId: asNullableString(dataObj?.id),
              event: asNonEmptyString(bodyObj?.event) ?? 'unknown',
              payloadJson: bodyObj ?? {},
            });
            return;
          }
          await appendMessageLog(db, mutation);
          return;
        }
        case 'user.state.set': {
          const channelUserId = readChannelUserId(mutation.params);
          if (!channelUserId) return;
          await setUserState(db, channelUserId, asNullableString(mutation.params.state));
          return;
        }
        case 'user.phone.link': {
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          if (!channelUserId || !phoneNormalized) return;
          await setUserPhone(db, channelUserId, phoneNormalized);
          return;
        }
        case 'notifications.update': {
          const channelUserId = asFiniteNumber(mutation.params.channelUserId ?? mutation.params.channelId);
          if (channelUserId === null) return;
          const settings: Record<string, boolean> = {};
          if (typeof mutation.params.notify_spb === 'boolean') settings.notify_spb = mutation.params.notify_spb;
          if (typeof mutation.params.notify_msk === 'boolean') settings.notify_msk = mutation.params.notify_msk;
          if (typeof mutation.params.notify_online === 'boolean') settings.notify_online = mutation.params.notify_online;
          if (Object.keys(settings).length === 0) return;
          await updateNotificationSettings(db, channelUserId, settings);
          return;
        }
        case 'delivery.attempt.log':
        case 'user.upsert': {
          if (mutation.type === 'delivery.attempt.log') {
            logger.info({ params: mutation.params }, 'delivery attempt log');
          }
          await appendMessageLog(db, mutation);
          return;
        }
        case 'message.retry.enqueue': {
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          const messageText = asNonEmptyString(mutation.params.messageText);
          if (!phoneNormalized || !messageText) {
            logger.warn({ mutationType: mutation.type }, 'skip retry enqueue: missing phone/message');
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

          await enqueueMessageRetryJob(db, {
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
