import type { DbPort, DbWriteMutation, DbWritePort } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { upsertRecord, insertEvent } from './repos/bookingRecords.js';
import { setUserPhone, setUserState, updateNotificationSettings, upsertUser } from './repos/channelUsers.js';
import { appendMessageLog } from './repos/messageLogs.js';
import {
  cancelDraftByIdentity,
  ensureIdentityForMessenger,
  insertConversation,
  insertConversationMessage,
  setConversationState,
  upsertDraftByIdentity,
  insertUserQuestion,
  insertQuestionMessage,
  setQuestionAnswered,
} from './repos/messageThreads.js';
import { enqueueMessageRetryJob } from './repos/jobQueue.js';
import {
  createContentAccessGrant,
  insertReminderDeliveryLog,
  markReminderOccurrenceFailed,
  markReminderOccurrenceQueued,
  markReminderOccurrenceSent,
  upsertReminderOccurrencePlanned,
  upsertReminderRule,
} from './repos/reminders.js';
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
  const raw = params.channelUserId ?? params.channelId;
  const asStr = asNonEmptyString(raw);
  if (asStr) return asStr;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw));
  return null;
}

function readResource(params: Record<string, unknown>): string {
  const r = asNonEmptyString(params.resource);
  return r ?? 'telegram';
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
              externalRecordId: asNullableString(bodyObj?.recordId) ?? asNullableString(dataObj?.id),
              event: asNonEmptyString(bodyObj?.event) ?? 'unknown',
              payloadJson: bodyObj ?? {},
            });
            return;
          }
          await appendMessageLog(db, mutation);
          return;
        }
        case 'user.upsert': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram') return;
          const externalId = asNonEmptyString(
            mutation.params.externalId
            ?? mutation.params.channelUserId
            ?? mutation.params.channelId,
          );
          const parsedId = externalId ? Number(externalId) : Number.NaN;
          if (!Number.isFinite(parsedId)) return;
          const username = asNullableString(mutation.params.username);
          const firstName = asNullableString(mutation.params.firstName);
          const lastName = asNullableString(mutation.params.lastName);
          await upsertUser(db, {
            id: Math.trunc(parsedId),
            ...(username ? { username } : {}),
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
          });
          return;
        }
        case 'user.state.set': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram') return;
          const channelUserId = readChannelUserId(mutation.params);
          if (!channelUserId) return;
          await setUserState(db, channelUserId, asNullableString(mutation.params.state));
          return;
        }
        case 'user.phone.link': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram') return;
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          if (!channelUserId || !phoneNormalized) return;
          await setUserPhone(db, channelUserId, phoneNormalized);
          return;
        }
        case 'draft.upsert': {
          const resource = readResource(mutation.params);
          const externalId = readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source) ?? resource;
          const id = asNonEmptyString(mutation.params.id);
          const draftTextCurrent = asNonEmptyString(mutation.params.draftTextCurrent);
          if (!resource || !externalId || !source || !id || !draftTextCurrent) return;
          const state = asNullableString(mutation.params.state);
          await upsertDraftByIdentity(db, {
            id,
            resource,
            externalId,
            source,
            ...(asNullableString(mutation.params.externalChatId) !== null ? { externalChatId: asNullableString(mutation.params.externalChatId) } : {}),
            ...(asNullableString(mutation.params.externalMessageId) !== null ? { externalMessageId: asNullableString(mutation.params.externalMessageId) } : {}),
            draftTextCurrent,
            ...(state ? { state } : {}),
          });
          return;
        }
        case 'draft.cancel': {
          const resource = readResource(mutation.params);
          const externalId = readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source);
          if (!resource || !externalId) return;
          await cancelDraftByIdentity(db, { resource, externalId, ...(source ? { source } : {}) });
          return;
        }
        case 'identity.ensure': {
          const resource = asNonEmptyString(mutation.params.resource);
          const externalId = asNonEmptyString(mutation.params.externalId);
          if (!resource || !externalId) return;
          await ensureIdentityForMessenger(db, { resource, externalId });
          return;
        }
        case 'conversation.open': {
          const resource = readResource(mutation.params);
          const externalId = readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source) ?? resource;
          const id = asNonEmptyString(mutation.params.id);
          const adminScope = asNonEmptyString(mutation.params.adminScope) ?? 'default';
          const status = asNonEmptyString(mutation.params.status) ?? 'waiting_admin';
          const openedAt = asNonEmptyString(mutation.params.openedAt);
          const lastMessageAt = asNonEmptyString(mutation.params.lastMessageAt) ?? openedAt;
          if (!resource || !externalId || !source || !id || !openedAt || !lastMessageAt) return;
          await insertConversation(db, {
            id,
            source,
            resource,
            externalId,
            adminScope,
            status,
            openedAt,
            lastMessageAt,
          });
          return;
        }
        case 'conversation.message.add': {
          const id = asNonEmptyString(mutation.params.id);
          const conversationId = asNonEmptyString(mutation.params.conversationId);
          const senderRole = asNonEmptyString(mutation.params.senderRole);
          const text = asNonEmptyString(mutation.params.text);
          const source = asNonEmptyString(mutation.params.source) ?? 'telegram';
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !conversationId || !senderRole || !text || !createdAt) return;
          await insertConversationMessage(db, {
            id,
            conversationId,
            senderRole,
            text,
            source,
            ...(asNullableString(mutation.params.externalChatId) !== null ? { externalChatId: asNullableString(mutation.params.externalChatId) } : {}),
            ...(asNullableString(mutation.params.externalMessageId) !== null ? { externalMessageId: asNullableString(mutation.params.externalMessageId) } : {}),
            createdAt,
          });
          return;
        }
        case 'conversation.state.set': {
          const id = asNonEmptyString(mutation.params.id ?? mutation.params.conversationId);
          const status = asNonEmptyString(mutation.params.status);
          if (!id || !status) return;
          await setConversationState(db, {
            id,
            status,
            ...(asNullableString(mutation.params.lastMessageAt) !== null ? { lastMessageAt: asNullableString(mutation.params.lastMessageAt) } : {}),
            ...(asNullableString(mutation.params.closedAt) !== null ? { closedAt: asNullableString(mutation.params.closedAt) } : {}),
            ...(asNullableString(mutation.params.closeReason) !== null ? { closeReason: asNullableString(mutation.params.closeReason) } : {}),
          });
          return;
        }
        case 'question.create': {
          const id = asNonEmptyString(mutation.params.id);
          const userIdentityId = asNonEmptyString(mutation.params.userIdentityId);
          const conversationId = asNullableString(mutation.params.conversationId);
          const text = asNonEmptyString(mutation.params.text);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !userIdentityId || !text || !createdAt) return;
          await insertUserQuestion(db, {
            id,
            userIdentityId,
            conversationId,
            telegramMessageId: asNullableString(mutation.params.telegramMessageId),
            text,
            createdAt,
          });
          return;
        }
        case 'question.message.add': {
          const id = asNonEmptyString(mutation.params.id);
          const questionId = asNonEmptyString(mutation.params.questionId);
          const senderType = asNonEmptyString(mutation.params.senderType);
          const messageText = asNonEmptyString(mutation.params.messageText);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !questionId || (senderType !== 'user' && senderType !== 'admin') || !messageText || !createdAt) return;
          await insertQuestionMessage(db, {
            id,
            questionId,
            senderType: senderType as 'user' | 'admin',
            messageText,
            createdAt,
          });
          return;
        }
        case 'question.markAnswered': {
          const questionId = asNonEmptyString(mutation.params.questionId);
          const answeredAt = asNonEmptyString(mutation.params.answeredAt);
          if (!questionId || !answeredAt) return;
          await setQuestionAnswered(db, { questionId, answeredAt });
          return;
        }
        case 'notifications.update': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram') return;
          const channelUserId = asFiniteNumber(mutation.params.channelUserId ?? mutation.params.channelId);
          if (channelUserId === null) return;
          const settings: Record<string, boolean> = {};
          if (typeof mutation.params.notify_spb === 'boolean') settings.notify_spb = mutation.params.notify_spb;
          if (typeof mutation.params.notify_msk === 'boolean') settings.notify_msk = mutation.params.notify_msk;
          if (typeof mutation.params.notify_online === 'boolean') settings.notify_online = mutation.params.notify_online;
          if (typeof mutation.params.notify_bookings === 'boolean') settings.notify_bookings = mutation.params.notify_bookings;
          if (Object.keys(settings).length === 0) return;
          await updateNotificationSettings(db, channelUserId, settings);
          return;
        }
        case 'reminders.rule.upsert': {
          const userId = asNonEmptyString(mutation.params.userId);
          const category = asNonEmptyString(mutation.params.category);
          const id = asNonEmptyString(mutation.params.id);
          const timezone = asNonEmptyString(mutation.params.timezone);
          const scheduleType = asNonEmptyString(mutation.params.scheduleType);
          const intervalMinutes = asFiniteNumber(mutation.params.intervalMinutes);
          const windowStartMinute = asFiniteNumber(mutation.params.windowStartMinute);
          const windowEndMinute = asFiniteNumber(mutation.params.windowEndMinute);
          const daysMask = asNonEmptyString(mutation.params.daysMask);
          const contentMode = asNonEmptyString(mutation.params.contentMode);
          if (
            !userId || !category || !id || !timezone || !scheduleType
            || intervalMinutes === null || windowStartMinute === null || windowEndMinute === null
            || !daysMask || !contentMode
          ) {
            return;
          }
          await upsertReminderRule(db, {
            id,
            userId,
            category: category as never,
            isEnabled: mutation.params.isEnabled === true,
            scheduleType,
            timezone,
            intervalMinutes,
            windowStartMinute,
            windowEndMinute,
            daysMask,
            contentMode: contentMode as never,
          });
          return;
        }
        case 'reminders.occurrence.upsertPlanned': {
          const id = asNonEmptyString(mutation.params.id);
          const ruleId = asNonEmptyString(mutation.params.ruleId);
          const occurrenceKey = asNonEmptyString(mutation.params.occurrenceKey);
          const plannedAt = asNonEmptyString(mutation.params.plannedAt);
          if (!id || !ruleId || !occurrenceKey || !plannedAt) return;
          await upsertReminderOccurrencePlanned(db, { id, ruleId, occurrenceKey, plannedAt });
          return;
        }
        case 'reminders.occurrence.markQueued': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          if (!occurrenceId) return;
          await markReminderOccurrenceQueued(
            db,
            occurrenceId,
            asNullableString(mutation.params.deliveryJobId),
          );
          return;
        }
        case 'reminders.occurrence.markSent': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          await markReminderOccurrenceSent(db, occurrenceId, channel);
          return;
        }
        case 'reminders.occurrence.markFailed': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          await markReminderOccurrenceFailed(
            db,
            occurrenceId,
            channel,
            asNullableString(mutation.params.errorCode),
          );
          return;
        }
        case 'reminders.delivery.log': {
          const id = asNonEmptyString(mutation.params.id);
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          const status = asNonEmptyString(mutation.params.status);
          if (!id || !occurrenceId || !channel || (status !== 'success' && status !== 'failed')) return;
          const payloadJson = typeof mutation.params.payloadJson === 'object' && mutation.params.payloadJson !== null
            ? mutation.params.payloadJson as Record<string, unknown>
            : {};
          await insertReminderDeliveryLog(db, {
            id,
            occurrenceId,
            channel,
            status,
            errorCode: asNullableString(mutation.params.errorCode),
            payloadJson,
          });
          return;
        }
        case 'content.access.grant.create': {
          const id = asNonEmptyString(mutation.params.id);
          const userId = asNonEmptyString(mutation.params.userId);
          const contentId = asNonEmptyString(mutation.params.contentId);
          const purpose = asNonEmptyString(mutation.params.purpose);
          const expiresAt = asNonEmptyString(mutation.params.expiresAt);
          if (!id || !userId || !contentId || !purpose || !expiresAt) return;
          const metaJson = typeof mutation.params.metaJson === 'object' && mutation.params.metaJson !== null
            ? mutation.params.metaJson as Record<string, unknown>
            : {};
          await createContentAccessGrant(db, {
            id,
            userId,
            contentId,
            purpose,
            tokenHash: asNullableString(mutation.params.tokenHash),
            expiresAt,
            metaJson,
          });
          return;
        }
        case 'delivery.attempt.log': {
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
            kind: 'message.deliver',
            payloadJson: {
              intent: {
                type: 'message.send',
                meta: {
                  eventId: `message-retry:${phoneNormalized}:${Date.now()}`,
                  occurredAt: new Date().toISOString(),
                  source: 'worker',
                },
                payload: {
                  message: { text: messageText },
                  delivery: {
                    channels: ['smsc'],
                    maxAttempts: 1,
                  },
                },
              },
              targets: [
                {
                  resource: 'smsc',
                  address: { phoneNormalized },
                },
              ],
              retry: {
                maxAttempts,
                backoffSeconds: [firstTryDelaySeconds],
              },
            },
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
