import type { DbPort, DbReadPort, DbWriteMutation, DbWritePort } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { upsertRecord, insertEvent } from './repos/bookingRecords.js';
import { setUserPhone, setUserState, updateNotificationSettings, upsertUser } from './repos/channelUsers.js';
import { appendMessageLog, insertDeliveryAttemptLog } from './repos/messageLogs.js';
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
  getReminderOccurrenceContextForProjection,
  insertReminderDeliveryLog,
  markReminderOccurrenceFailed,
  markReminderOccurrenceQueued,
  markReminderOccurrenceSent,
  upsertReminderOccurrencePlanned,
  upsertReminderRule,
} from './repos/reminders.js';
import {
  REMINDER_RULE_UPSERTED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_DELIVERY_LOGGED,
  CONTENT_ACCESS_GRANTED,
  APPOINTMENT_RECORD_UPSERTED,
  MAILING_TOPIC_UPSERTED,
  USER_SUBSCRIPTION_UPSERTED,
  MAILING_LOG_SENT,
} from '../../kernel/contracts/index.js';
import { enqueueProjectionEvent } from './repos/projectionOutbox.js';
import { projectionIdempotencyKey, hashPayload } from './repos/projectionKeys.js';
import { logger } from '../observability/logger.js';
import { insertMailingLog } from './repos/mailingLogs.js';

type BookingUpsertParams = {
  externalRecordId?: unknown;
  phoneNormalized?: unknown;
  recordAt?: unknown;
  status?: unknown;
  payloadJson?: unknown;
  lastEvent?: unknown;
  patientFirstName?: unknown;
  patientLastName?: unknown;
  patientEmail?: unknown;
  integratorBranchId?: unknown;
  branchName?: unknown;
  gcalEventId?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Best-effort split: "Иванов Иван" -> last=Иванов, first=Иван. */
function parseNameToFirstLast(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { lastName: parts[0] ?? null, firstName: parts.slice(1).join(' ') };
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
export function createDbWritePort(input: {
  db?: DbPort;
  readPort?: DbReadPort;
} = {}): DbWritePort {
  const db = input.db ?? createDbPort();
  const readPort = input.readPort;
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
          const phoneNormalized = asNullableString(params.phoneNormalized);
          const recordAt = asNullableString(params.recordAt);
          const payloadJson = typeof params.payloadJson === 'object' && params.payloadJson !== null
            ? (params.payloadJson as Record<string, unknown>)
            : {};
          const lastEvent = asNonEmptyString(params.lastEvent) ?? 'unknown';
          const updatedAt = new Date().toISOString();
          const rawEmail = asNullableString(params.patientEmail) ?? asNullableString(payloadJson.email);
          const rawBranchId =
            asNullableString(params.integratorBranchId) ??
            asNullableString(payloadJson.branch_id) ??
            (payloadJson.branch_id != null ? String(payloadJson.branch_id) : null);
          const rawBranchName =
            asNullableString(params.branchName) ??
            asNullableString(payloadJson.branch_name) ??
            asNullableString(payloadJson.branch_title);
          const gcalEventId = asNullableString(params.gcalEventId);
          const nameFromPayload = asNullableString(payloadJson.name);
          const parsedFromName = nameFromPayload
            ? parseNameToFirstLast(nameFromPayload)
            : { firstName: null, lastName: null };
          const patientFirstName: string | null =
            asNullableString(params.patientFirstName) ?? parsedFromName.firstName;
          const patientLastName: string | null =
            asNullableString(params.patientLastName) ?? parsedFromName.lastName;
          await db.tx(async (txDb) => {
            await upsertRecord(txDb, {
              externalRecordId,
              phoneNormalized,
              recordAt,
              status,
              gcalEventId,
              payloadJson,
              lastEvent,
            });
            const projectionPayload: Record<string, unknown> = {
              integratorRecordId: externalRecordId,
              phoneNormalized: phoneNormalized ?? null,
              recordAt: recordAt ?? null,
              status,
              payloadJson,
              lastEvent,
              updatedAt,
              patientFirstName: patientFirstName ?? null,
              patientLastName: patientLastName ?? null,
              patientEmail: rawEmail ?? null,
              integratorBranchId: rawBranchId ?? null,
              branchName: rawBranchName ?? null,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: APPOINTMENT_RECORD_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(
                APPOINTMENT_RECORD_UPSERTED,
                externalRecordId,
                hashPayload(projectionPayload),
              ),
              occurredAt: updatedAt,
              payload: projectionPayload,
            });
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
          if (resource !== 'telegram' && resource !== 'max') return;
          const externalId = asNonEmptyString(
            mutation.params.externalId
            ?? mutation.params.channelUserId
            ?? mutation.params.channelId,
          );
          const username = asNullableString(mutation.params.username);
          const firstName = asNullableString(mutation.params.firstName);
          const lastName = asNullableString(mutation.params.lastName);
          if (!externalId) return;
          await db.tx(async (txDb) => {
            let integratorUserId: string | null;
            if (resource === 'telegram') {
              const parsedId = Number(externalId);
              if (!Number.isFinite(parsedId)) return;
              const userPayload = {
                id: Math.trunc(parsedId),
                ...(username ? { username } : {}),
                ...(firstName ? { first_name: firstName } : {}),
                ...(lastName ? { last_name: lastName } : {}),
              };
              const row = await upsertUser(txDb, userPayload);
              integratorUserId = row?.id ?? null;
            } else {
              await ensureIdentityForMessenger(txDb, { resource: 'max', externalId });
              const identityRes = await txDb.query<{ user_id: string }>(
                "SELECT user_id::text AS user_id FROM identities WHERE resource = $1 AND external_id = $2 LIMIT 1",
                [resource, externalId]
              );
              integratorUserId = identityRes.rows[0]?.user_id ?? null;
            }
            if (!integratorUserId) return;
            const projectionPayload: Record<string, unknown> = {
              integratorUserId,
              channelCode: resource,
              externalId,
              displayName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'user.upserted',
              idempotencyKey: projectionIdempotencyKey(
                'user.upserted',
                integratorUserId,
                hashPayload(projectionPayload),
              ),
              occurredAt: new Date().toISOString(),
              payload: projectionPayload,
            });
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
          if (resource !== 'telegram' && resource !== 'max') return;
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          if (!channelUserId || !phoneNormalized) return;
          await db.tx(async (txDb) => {
            if (resource === "max") {
              await ensureIdentityForMessenger(txDb, { resource: "max", externalId: channelUserId });
            }
            await setUserPhone(txDb, channelUserId, phoneNormalized, resource);
            if (readPort) {
              const link = await readPort.readDb<{ userId?: string } | null>({
                type: 'user.byIdentity',
                params: { resource, externalId: channelUserId },
              });
              const uid = link && typeof link === 'object' && typeof link.userId === 'string'
                ? link.userId : null;
              if (uid) {
                await enqueueProjectionEvent(txDb, {
                  eventType: 'contact.linked',
                  idempotencyKey: `contact.linked:${uid}:${phoneNormalized}`,
                  occurredAt: new Date().toISOString(),
                  payload: { integratorUserId: uid, phoneNormalized },
                });
              }
            }
          });
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
          await db.tx(async (txDb) => {
            await insertConversation(txDb, {
              id,
              source,
              resource,
              externalId,
              adminScope,
              status,
              openedAt,
              lastMessageAt,
            });
            const convRow = await txDb.query<{ user_identity_id: string }>(
              'SELECT user_identity_id::text AS user_identity_id FROM conversations WHERE id = $1',
              [id],
            );
            const integratorUserId = convRow.rows[0]?.user_identity_id ?? null;
            const payload: Record<string, unknown> = {
              integratorConversationId: id,
              integratorUserId,
              source,
              adminScope,
              status,
              openedAt,
              lastMessageAt,
              channelCode: resource,
              channelExternalId: externalId,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.conversation.opened',
              idempotencyKey: projectionIdempotencyKey('support.conversation.opened', id, hashPayload(payload)),
              occurredAt: openedAt,
              payload,
            });
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
          const externalChatId = asNullableString(mutation.params.externalChatId);
          const externalMessageId = asNullableString(mutation.params.externalMessageId);
          const messageType = asNullableString(mutation.params.messageType) ?? 'text';
          if (!id || !conversationId || !senderRole || !text || !createdAt) return;
          await db.tx(async (txDb) => {
            await insertConversationMessage(txDb, {
              id,
              conversationId,
              senderRole,
              text,
              source,
              ...(externalChatId !== null ? { externalChatId } : {}),
              ...(externalMessageId !== null ? { externalMessageId } : {}),
              createdAt,
            });
            const payload: Record<string, unknown> = {
              integratorMessageId: id,
              integratorConversationId: conversationId,
              senderRole,
              messageType,
              text,
              source,
              externalChatId: externalChatId ?? null,
              externalMessageId: externalMessageId ?? null,
              createdAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.conversation.message.appended',
              idempotencyKey: projectionIdempotencyKey('support.conversation.message.appended', id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          return;
        }
        case 'conversation.state.set': {
          const id = asNonEmptyString(mutation.params.id ?? mutation.params.conversationId);
          const status = asNonEmptyString(mutation.params.status);
          const lastMessageAt = asNullableString(mutation.params.lastMessageAt);
          const closedAt = asNullableString(mutation.params.closedAt);
          const closeReason = asNullableString(mutation.params.closeReason);
          if (!id || !status) return;
          await db.tx(async (txDb) => {
            await setConversationState(txDb, {
              id,
              status,
              ...(lastMessageAt !== null ? { lastMessageAt } : {}),
              ...(closedAt !== null ? { closedAt } : {}),
              ...(closeReason !== null ? { closeReason } : {}),
            });
            const payload: Record<string, unknown> = {
              integratorConversationId: id,
              status,
              lastMessageAt: lastMessageAt ?? null,
              closedAt: closedAt ?? null,
              closeReason: closeReason ?? null,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.conversation.status.changed',
              idempotencyKey: projectionIdempotencyKey('support.conversation.status.changed', id, hashPayload(payload)),
              occurredAt: new Date().toISOString(),
              payload,
            });
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
          await db.tx(async (txDb) => {
            await insertUserQuestion(txDb, {
              id,
              userIdentityId,
              conversationId,
              telegramMessageId: asNullableString(mutation.params.telegramMessageId),
              text,
              createdAt,
            });
            const payload: Record<string, unknown> = {
              integratorQuestionId: id,
              integratorConversationId: conversationId,
              integratorUserId: userIdentityId,
              status: 'open',
              createdAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.question.created',
              idempotencyKey: projectionIdempotencyKey('support.question.created', id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
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
          await db.tx(async (txDb) => {
            await insertQuestionMessage(txDb, {
              id,
              questionId,
              senderType: senderType as 'user' | 'admin',
              messageText,
              createdAt,
            });
            const payload: Record<string, unknown> = {
              integratorQuestionMessageId: id,
              integratorQuestionId: questionId,
              senderRole: senderType,
              text: messageText,
              createdAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.question.message.appended',
              idempotencyKey: projectionIdempotencyKey('support.question.message.appended', id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          return;
        }
        case 'question.markAnswered': {
          const questionId = asNonEmptyString(mutation.params.questionId);
          const answeredAt = asNonEmptyString(mutation.params.answeredAt);
          if (!questionId || !answeredAt) return;
          await db.tx(async (txDb) => {
            await setQuestionAnswered(txDb, { questionId, answeredAt });
            const payload: Record<string, unknown> = {
              integratorQuestionId: questionId,
              answeredAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.question.answered',
              idempotencyKey: projectionIdempotencyKey('support.question.answered', questionId, hashPayload(payload)),
              occurredAt: answeredAt,
              payload,
            });
          });
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
          await db.tx(async (txDb) => {
            await updateNotificationSettings(txDb, channelUserId, settings);
            if (readPort) {
              const link = await readPort.readDb<{ userId?: string } | null>({
                type: 'user.byIdentity',
                params: { resource, externalId: String(channelUserId) },
              });
              const uid = link && typeof link === 'object' && typeof link.userId === 'string'
                ? link.userId : null;
              if (uid) {
                const topicMap: Record<string, string> = {
                  notify_spb: 'booking_spb', notify_msk: 'booking_msk',
                  notify_online: 'booking_online', notify_bookings: 'bookings',
                };
                const topics = Object.entries(settings)
                  .filter(([k]) => k in topicMap)
                  .map(([k, v]) => ({ topicCode: topicMap[k], isEnabled: v }));
                if (topics.length > 0) {
                  await enqueueProjectionEvent(txDb, {
                    eventType: 'preferences.updated',
                    idempotencyKey: projectionIdempotencyKey(
                      'preferences.updated',
                      uid,
                      hashPayload({ topics }),
                    ),
                    occurredAt: new Date().toISOString(),
                    payload: { integratorUserId: uid, topics },
                  });
                }
              }
            }
          });
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
          const isEnabled = mutation.params.isEnabled === true;
          await db.tx(async (txDb) => {
            const updatedAt = await upsertReminderRule(txDb, {
              id,
              userId,
              category: category as never,
              isEnabled,
              scheduleType,
              timezone,
              intervalMinutes,
              windowStartMinute,
              windowEndMinute,
              daysMask,
              contentMode: contentMode as never,
            });
            const keyPayload = {
              integratorRuleId: id,
              integratorUserId: userId,
              category,
              isEnabled,
              scheduleType,
              timezone,
              intervalMinutes,
              windowStartMinute,
              windowEndMinute,
              daysMask,
              contentMode,
            };
            const payload = { ...keyPayload, updatedAt };
            await enqueueProjectionEvent(txDb, {
              eventType: REMINDER_RULE_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(REMINDER_RULE_UPSERTED, id, hashPayload(keyPayload)),
              occurredAt: updatedAt,
              payload,
            });
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
          await db.tx(async (txDb) => {
            await markReminderOccurrenceSent(txDb, occurrenceId, channel);
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: ctx.userId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              await enqueueProjectionEvent(txDb, {
                eventType: REMINDER_OCCURRENCE_FINALIZED,
                idempotencyKey: projectionIdempotencyKey(
                  REMINDER_OCCURRENCE_FINALIZED,
                  occurrenceId,
                  hashPayload(payload),
                ),
                occurredAt: ctx.occurredAt,
                payload,
              });
            }
          });
          return;
        }
        case 'reminders.occurrence.markFailed': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          await db.tx(async (txDb) => {
            await markReminderOccurrenceFailed(
              txDb,
              occurrenceId,
              channel,
              asNullableString(mutation.params.errorCode),
            );
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: ctx.userId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              await enqueueProjectionEvent(txDb, {
                eventType: REMINDER_OCCURRENCE_FINALIZED,
                idempotencyKey: projectionIdempotencyKey(
                  REMINDER_OCCURRENCE_FINALIZED,
                  occurrenceId,
                  hashPayload(payload),
                ),
                occurredAt: ctx.occurredAt,
                payload,
              });
            }
          });
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
          await db.tx(async (txDb) => {
            const createdAt = await insertReminderDeliveryLog(txDb, {
              id,
              occurrenceId,
              channel,
              status,
              errorCode: asNullableString(mutation.params.errorCode),
              payloadJson,
            });
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx) {
              const payload = {
                integratorDeliveryLogId: id,
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: ctx.userId,
                channel,
                status,
                errorCode: asNullableString(mutation.params.errorCode),
                payloadJson,
                createdAt,
              };
              await enqueueProjectionEvent(txDb, {
                eventType: REMINDER_DELIVERY_LOGGED,
                idempotencyKey: projectionIdempotencyKey(REMINDER_DELIVERY_LOGGED, id, hashPayload(payload)),
                occurredAt: createdAt,
                payload,
              });
            }
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
          await db.tx(async (txDb) => {
            const createdAt = await createContentAccessGrant(txDb, {
              id,
              userId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              metaJson,
            });
            const payload = {
              integratorGrantId: id,
              integratorUserId: userId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              revokedAt: null as string | null,
              metaJson,
              createdAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: CONTENT_ACCESS_GRANTED,
              idempotencyKey: projectionIdempotencyKey(CONTENT_ACCESS_GRANTED, id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          return;
        }
        case 'delivery.attempt.log': {
          if (mutation.type === 'delivery.attempt.log') {
            logger.info({ params: mutation.params }, 'delivery attempt log');
          }
          const dalParams = mutation.params as {
            intentType?: unknown;
            intentEventId?: unknown;
            correlationId?: unknown;
            channel?: unknown;
            status?: unknown;
            attempt?: unknown;
            reason?: unknown;
            payload?: unknown;
            occurredAt?: unknown;
          };
          const intentEventId = asNullableString(dalParams.intentEventId);
          const correlationId = asNullableString(dalParams.correlationId);
          const channel = asNonEmptyString(dalParams.channel);
          const status = asNonEmptyString(dalParams.status);
          const attemptRaw = typeof dalParams.attempt === 'number' && Number.isFinite(dalParams.attempt)
            ? Math.trunc(dalParams.attempt) : null;
          const reason = asNullableString(dalParams.reason);
          const payloadJson = typeof dalParams.payload === 'object' && dalParams.payload !== null
            ? (dalParams.payload as Record<string, unknown>) : {};
          const occurredAt = asNonEmptyString(dalParams.occurredAt) ?? new Date().toISOString();
          await db.tx(async (txDb) => {
            await insertDeliveryAttemptLog(txDb, dalParams);
            const payload: Record<string, unknown> = {
              intentEventId: intentEventId ?? null,
              correlationId: correlationId ?? null,
              channelCode: channel ?? 'unknown',
              status: status ?? 'failed',
              attempt: attemptRaw ?? 1,
              reason: reason ?? null,
              payloadJson,
              occurredAt,
            };
            const key = intentEventId ?? correlationId ?? `del-${hashPayload(payload)}`;
            await enqueueProjectionEvent(txDb, {
              eventType: 'support.delivery.attempt.logged',
              idempotencyKey: projectionIdempotencyKey('support.delivery.attempt.logged', String(key), hashPayload(payload)),
              occurredAt,
              payload,
            });
          });
          return;
        }
        case 'mailing.topic.upsert': {
          const topicId = asFiniteNumber(mutation.params.integratorTopicId) ?? asFiniteNumber(mutation.params.id);
          const code = asNonEmptyString(mutation.params.code);
          const title = asNonEmptyString(mutation.params.title);
          const key = asNonEmptyString(mutation.params.key);
          const isActive = typeof mutation.params.isActive === 'boolean' ? mutation.params.isActive : true;
          if (topicId === null || !code || !title || !key) {
            logger.warn({ mutationType: mutation.type }, 'skip mailing.topic.upsert: missing required fields');
            return;
          }
          const updatedAt = new Date().toISOString();
          await db.tx(async (txDb) => {
            const payload: Record<string, unknown> = {
              integratorTopicId: String(topicId),
              code,
              title,
              key,
              isActive,
              updatedAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: MAILING_TOPIC_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(MAILING_TOPIC_UPSERTED, String(topicId), hashPayload(payload)),
              occurredAt: updatedAt,
              payload,
            });
          });
          return;
        }
        case 'user.subscription.upsert': {
          const userId = asFiniteNumber(mutation.params.integratorUserId);
          const topicId = asFiniteNumber(mutation.params.integratorTopicId);
          const isActive = typeof mutation.params.isActive === 'boolean' ? mutation.params.isActive : true;
          if (userId === null || topicId === null) {
            logger.warn({ mutationType: mutation.type }, 'skip user.subscription.upsert: missing userId or topicId');
            return;
          }
          const updatedAt = new Date().toISOString();
          await db.tx(async (txDb) => {
            const payload: Record<string, unknown> = {
              integratorUserId: String(userId),
              integratorTopicId: String(topicId),
              isActive,
              updatedAt,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: USER_SUBSCRIPTION_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(USER_SUBSCRIPTION_UPSERTED, `${userId}:${topicId}`, hashPayload(payload)),
              occurredAt: updatedAt,
              payload,
            });
          });
          return;
        }
        case 'mailing.log.append': {
          const userId = asFiniteNumber(mutation.params.integratorUserId);
          const mailingId = asFiniteNumber(mutation.params.integratorMailingId);
          const status = asNonEmptyString(mutation.params.status);
          const sentAt = asNonEmptyString(mutation.params.sentAt) ?? new Date().toISOString();
          const error = asNullableString(mutation.params.errorText ?? mutation.params.error);
          if (userId === null || mailingId === null || !status) {
            logger.warn({ mutationType: mutation.type }, 'skip mailing.log.append: missing required fields');
            return;
          }
          await db.tx(async (txDb) => {
            await insertMailingLog(txDb, { userId, mailingId, status, sentAt, error });
            const payload: Record<string, unknown> = {
              integratorUserId: String(userId),
              integratorMailingId: String(mailingId),
              status,
              sentAt,
              errorText: error,
            };
            await enqueueProjectionEvent(txDb, {
              eventType: MAILING_LOG_SENT,
              idempotencyKey: projectionIdempotencyKey(MAILING_LOG_SENT, `${userId}:${mailingId}`, hashPayload(payload)),
              occurredAt: sentAt,
              payload,
            });
          });
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
                  // Intentionally unique per attempt (not a projection idempotency key); retry events must not dedupe.
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
