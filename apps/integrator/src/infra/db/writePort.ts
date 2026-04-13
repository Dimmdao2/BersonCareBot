import type {
  DbPort,
  DbReadPort,
  DbWriteDbResult,
  DbWriteMutation,
  DbWritePort,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { upsertRecord, insertEvent } from './repos/bookingRecords.js';
import { setUserPhone, setUserState, updateNotificationSettings, upsertUser } from './repos/channelUsers.js';
import { appendMessageLog, insertDeliveryAttemptLog } from './repos/messageLogs.js';
import {
  applyMessengerPhonePublicBind,
  MessengerPhoneLinkError,
} from './repos/messengerPhonePublicBind.js';
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
  markReminderOccurrenceSkippedLocal,
  rescheduleReminderOccurrencePlanned,
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
import type { ProjectionFanoutInput } from './repos/projectionFanout.js';
import { tryEmitWebappProjectionThenEnqueue } from './repos/projectionFanout.js';
import { projectionIdempotencyKey, hashPayload, hashPayloadExcludingKeys } from './repos/projectionKeys.js';
import {
  canonicalizeIntegratorUserIdKeysInObject,
  resolveCanonicalIntegratorUserId,
  resolveCanonicalUserIdFromIdentityId,
} from './repos/canonicalUserId.js';
import { logger } from '../observability/logger.js';
import { insertMailingLog } from './repos/mailingLogs.js';
import { normalizeRuPhoneE164 } from '../phone/normalizeRuPhoneE164.js';
import { isExplicitZonedIsoInstant } from '../../shared/explicitZonedIsoInstant.js';

type BookingUpsertParams = {
  externalRecordId?: unknown;
  phoneNormalized?: unknown;
  recordAt?: unknown;
  /** ISO datetime end of the appointment slot (Stage 11 compat-sync). */
  dateTimeEnd?: unknown;
  status?: unknown;
  payloadJson?: unknown;
  lastEvent?: unknown;
  patientFirstName?: unknown;
  patientLastName?: unknown;
  patientEmail?: unknown;
  integratorBranchId?: unknown;
  branchName?: unknown;
  /** Rubitime service metadata (Stage 11 compat-sync). */
  serviceId?: unknown;
  serviceName?: unknown;
  /** Specialist/cooperator id for catalog branch_service lookup (Stage 2 F-04). */
  rubitimeCooperatorId?: unknown;
  gcalEventId?: unknown;
  timeNormalizationStatus?: unknown;
  timeNormalizationFieldErrors?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Split name into first/last only when unambiguous (exactly 2 words).
 * With 3+ words (e.g. Russian ФИО with patronymic, or swapped order)
 * we cannot reliably distinguish first/last, so we skip the split.
 */
function parseNameToFirstLast(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  if (parts.length === 2) return { lastName: parts[0] ?? null, firstName: parts[1] ?? null };
  return { firstName: null, lastName: null };
}

function readTimeNormalizationStatus(value: unknown): 'ok' | 'degraded' {
  return value === 'degraded' ? 'degraded' : 'ok';
}

function readTimeNormalizationFieldErrors(
  value: unknown,
): Array<{ field: string; reason: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ field: string; reason: string }> = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const field = typeof rec.field === 'string' ? rec.field : '';
    const reason = typeof rec.reason === 'string' ? rec.reason : '';
    if (field && reason) out.push({ field, reason });
  }
  return out;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const stringValue = asNonEmptyString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/** Rejects naive / session-dependent datetimes so `::timestamptz` never interprets wall time without offset. */
function bookingTimestamptzOrNull(label: 'recordAt' | 'dateTimeEnd', externalRecordId: string, raw: string | null): string | null {
  if (!raw) return null;
  if (isExplicitZonedIsoInstant(raw)) return raw;
  logger.warn(
    { externalRecordId, [label]: raw.slice(0, 120) },
    `booking.upsert: ${label} rejected (not explicit Z/offset ISO), treating as null`,
  );
  return null;
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
  /** When set, projection events are POSTed to webapp immediately after commit; outbox only on failure. */
  webappEventsPort?: WebappEventsPort;
} = {}): DbWritePort {
  const db = input.db ?? createDbPort();
  const readPort = input.readPort;
  const webappEventsPort = input.webappEventsPort;

  async function fanoutProjectionsAfterTx(pending: ProjectionFanoutInput[]): Promise<void> {
    for (const ev of pending) {
      await tryEmitWebappProjectionThenEnqueue(db, webappEventsPort, ev);
    }
  }

  return {
    async writeDb(mutation: DbWriteMutation): Promise<void | DbWriteDbResult> {
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
          const rawPhone = asNullableString(params.phoneNormalized);
          const phoneNormalized = rawPhone ? normalizeRuPhoneE164(rawPhone) : null;
          const recordAtRaw = asNonEmptyString(params.recordAt);
          const recordAt = bookingTimestamptzOrNull('recordAt', externalRecordId, recordAtRaw);
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
          // Stage 11 compat-sync enrichment fields.
          const rawServiceId =
            asNullableString(params.serviceId) ??
            asNullableString(payloadJson.service_id) ??
            (payloadJson.service_id != null ? String(payloadJson.service_id) : null);
          const rawServiceName =
            asNullableString(params.serviceName) ??
            asNullableString(payloadJson.service_name) ??
            asNullableString(payloadJson.service_title);
          let rawDateTimeEnd =
            asNonEmptyString(params.dateTimeEnd) ??
            asNonEmptyString(
              typeof payloadJson.datetime_end === 'string' ? payloadJson.datetime_end : undefined,
            ) ??
            asNonEmptyString(
              typeof payloadJson.date_time_end === 'string' ? payloadJson.date_time_end : undefined,
            );
          rawDateTimeEnd = bookingTimestamptzOrNull('dateTimeEnd', externalRecordId, rawDateTimeEnd);
          const rawCooperatorId =
            asNullableString(params.rubitimeCooperatorId) ??
            asNullableString(payloadJson.cooperator_id) ??
            (payloadJson.cooperator_id != null ? String(payloadJson.cooperator_id) : null) ??
            asNullableString(payloadJson.specialist_id) ??
            (payloadJson.specialist_id != null ? String(payloadJson.specialist_id) : null);
          const nameFromPayload = asNullableString(payloadJson.name);
          const parsedFromName = nameFromPayload
            ? parseNameToFirstLast(nameFromPayload)
            : { firstName: null, lastName: null };
          const patientFirstName: string | null =
            asNullableString(params.patientFirstName) ?? parsedFromName.firstName;
          const patientLastName: string | null =
            asNullableString(params.patientLastName) ?? parsedFromName.lastName;
          const timeNormalizationStatus = readTimeNormalizationStatus(params.timeNormalizationStatus);
          const timeNormalizationFieldErrors = readTimeNormalizationFieldErrors(
            params.timeNormalizationFieldErrors,
          );
          const pendingProjections: ProjectionFanoutInput[] = [];
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
            const payloadJsonForProjection: Record<string, unknown> =
              typeof payloadJson === 'object' && payloadJson !== null && !Array.isArray(payloadJson)
                ? (JSON.parse(JSON.stringify(payloadJson)) as Record<string, unknown>)
                : {};
            await canonicalizeIntegratorUserIdKeysInObject(txDb, payloadJsonForProjection);
            const projectionPayload: Record<string, unknown> = {
              integratorRecordId: externalRecordId,
              phoneNormalized: phoneNormalized ?? null,
              recordAt: recordAt ?? null,
              dateTimeEnd: rawDateTimeEnd ?? null,
              status,
              payloadJson: payloadJsonForProjection,
              lastEvent,
              updatedAt,
              patientFirstName: patientFirstName ?? null,
              patientLastName: patientLastName ?? null,
              patientEmail: rawEmail ?? null,
              integratorBranchId: rawBranchId ?? null,
              branchName: rawBranchName ?? null,
              serviceId: rawServiceId ?? null,
              serviceName: rawServiceName ?? null,
              rubitimeCooperatorId: rawCooperatorId ?? null,
              timeNormalizationStatus,
              ...(timeNormalizationFieldErrors.length > 0
                ? { timeNormalizationFieldErrors }
                : {}),
            };
            pendingProjections.push({
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
          await fanoutProjectionsAfterTx(pendingProjections);
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
              event: asNonEmptyString(bodyObj?.event)
                ?? asNonEmptyString(bodyObj?.action)
                ?? asNonEmptyString(bodyObj?.eventType)
                ?? 'unknown',
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
          const pendingUserUpsert: ProjectionFanoutInput[] = [];
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
            const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, integratorUserId);
            const projectionPayload: Record<string, unknown> = {
              integratorUserId: canonicalUserId,
              channelCode: resource,
              externalId,
              displayName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
            };
            pendingUserUpsert.push({
              eventType: 'user.upserted',
              idempotencyKey: projectionIdempotencyKey(
                'user.upserted',
                canonicalUserId,
                hashPayload(projectionPayload),
              ),
              occurredAt: new Date().toISOString(),
              payload: projectionPayload,
            });
          });
          await fanoutProjectionsAfterTx(pendingUserUpsert);
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
          if (resource !== 'telegram' && resource !== 'max') {
            return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true };
          }
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          if (!channelUserId || !phoneNormalized) {
            return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true };
          }
          try {
            let applied = false;
            await db.tx(async (txDb) => {
              if (resource === 'max') {
                await ensureIdentityForMessenger(txDb, { resource: 'max', externalId: channelUserId });
              }
              const idPeek = await txDb.query<{ user_id: string }>(
                `SELECT i.user_id::text AS user_id
                 FROM identities i
                 WHERE i.resource = $2 AND i.external_id = $1
                 LIMIT 1`,
                [channelUserId, resource],
              );
              const rawUid = idPeek.rows[0]?.user_id ?? null;
              if (!rawUid) {
                throw new MessengerPhoneLinkError('db_transient_failure');
              }
              const canonicalUid = await resolveCanonicalIntegratorUserId(txDb, rawUid);
              await applyMessengerPhonePublicBind(txDb, {
                channelCode: resource,
                externalId: channelUserId,
                phoneNormalized,
                canonicalIntegratorUserId: canonicalUid,
              });
              const outcome = await setUserPhone(txDb, channelUserId, phoneNormalized, resource);
              if (outcome === 'failed') {
                throw new MessengerPhoneLinkError('db_transient_failure');
              }
              if (outcome === 'noop_conflict') {
                throw new MessengerPhoneLinkError('phone_owned_by_other_user');
              }
              applied = true;
            });
            return { userPhoneLinkApplied: applied };
          } catch (err) {
            if (err instanceof MessengerPhoneLinkError) {
              if (err.code === 'db_transient_failure') {
                return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true, phoneLinkReason: err.code };
              }
              return { userPhoneLinkApplied: false, phoneLinkReason: err.code };
            }
            logger.error({ err }, 'user.phone.link: unexpected error');
            return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true, phoneLinkReason: 'db_transient_failure' };
          }
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
          const pendingConvOpen: ProjectionFanoutInput[] = [];
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
            const rawIdentityId = convRow.rows[0]?.user_identity_id ?? null;
            const integratorUserId =
              rawIdentityId != null
                ? await resolveCanonicalUserIdFromIdentityId(txDb, rawIdentityId)
                : null;
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
            pendingConvOpen.push({
              eventType: 'support.conversation.opened',
              idempotencyKey: projectionIdempotencyKey(
                'support.conversation.opened',
                id,
                hashPayloadExcludingKeys(payload, ['integratorUserId']),
              ),
              occurredAt: openedAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingConvOpen);
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
          const pendingConvMsg: ProjectionFanoutInput[] = [];
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
            pendingConvMsg.push({
              eventType: 'support.conversation.message.appended',
              idempotencyKey: projectionIdempotencyKey('support.conversation.message.appended', id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingConvMsg);
          return;
        }
        case 'conversation.state.set': {
          const id = asNonEmptyString(mutation.params.id ?? mutation.params.conversationId);
          const status = asNonEmptyString(mutation.params.status);
          const lastMessageAt = asNullableString(mutation.params.lastMessageAt);
          const closedAt = asNullableString(mutation.params.closedAt);
          const closeReason = asNullableString(mutation.params.closeReason);
          if (!id || !status) return;
          const pendingConvState: ProjectionFanoutInput[] = [];
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
            pendingConvState.push({
              eventType: 'support.conversation.status.changed',
              idempotencyKey: projectionIdempotencyKey('support.conversation.status.changed', id, hashPayload(payload)),
              occurredAt: new Date().toISOString(),
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingConvState);
          return;
        }
        case 'question.create': {
          const id = asNonEmptyString(mutation.params.id);
          const userIdentityId = asNonEmptyString(mutation.params.userIdentityId);
          const conversationId = asNullableString(mutation.params.conversationId);
          const text = asNonEmptyString(mutation.params.text);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !userIdentityId || !text || !createdAt) return;
          const pendingQCreate: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await insertUserQuestion(txDb, {
              id,
              userIdentityId,
              conversationId,
              telegramMessageId: asNullableString(mutation.params.telegramMessageId),
              text,
              createdAt,
            });
            const canonicalIntegratorUserId = await resolveCanonicalUserIdFromIdentityId(txDb, userIdentityId);
            const payload: Record<string, unknown> = {
              integratorQuestionId: id,
              integratorConversationId: conversationId,
              integratorUserId: canonicalIntegratorUserId,
              status: 'open',
              createdAt,
            };
            pendingQCreate.push({
              eventType: 'support.question.created',
              idempotencyKey: projectionIdempotencyKey(
                'support.question.created',
                id,
                hashPayloadExcludingKeys(payload, ['integratorUserId']),
              ),
              occurredAt: createdAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingQCreate);
          return;
        }
        case 'question.message.add': {
          const id = asNonEmptyString(mutation.params.id);
          const questionId = asNonEmptyString(mutation.params.questionId);
          const senderType = asNonEmptyString(mutation.params.senderType);
          const messageText = asNonEmptyString(mutation.params.messageText);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !questionId || (senderType !== 'user' && senderType !== 'admin') || !messageText || !createdAt) return;
          const pendingQM: ProjectionFanoutInput[] = [];
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
            pendingQM.push({
              eventType: 'support.question.message.appended',
              idempotencyKey: projectionIdempotencyKey('support.question.message.appended', id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingQM);
          return;
        }
        case 'question.markAnswered': {
          const questionId = asNonEmptyString(mutation.params.questionId);
          const answeredAt = asNonEmptyString(mutation.params.answeredAt);
          if (!questionId || !answeredAt) return;
          const pendingQA: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await setQuestionAnswered(txDb, { questionId, answeredAt });
            const payload: Record<string, unknown> = {
              integratorQuestionId: questionId,
              answeredAt,
            };
            pendingQA.push({
              eventType: 'support.question.answered',
              idempotencyKey: projectionIdempotencyKey('support.question.answered', questionId, hashPayload(payload)),
              occurredAt: answeredAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingQA);
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
          const pendingPrefs: ProjectionFanoutInput[] = [];
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
                const canonicalUid = await resolveCanonicalIntegratorUserId(txDb, uid);
                const topicMap: Record<string, string> = {
                  notify_spb: 'booking_spb', notify_msk: 'booking_msk',
                  notify_online: 'booking_online', notify_bookings: 'bookings',
                };
                const topics = Object.entries(settings)
                  .filter(([k]) => k in topicMap)
                  .map(([k, v]) => ({ topicCode: topicMap[k], isEnabled: v }));
                if (topics.length > 0) {
                  pendingPrefs.push({
                    eventType: 'preferences.updated',
                    idempotencyKey: projectionIdempotencyKey(
                      'preferences.updated',
                      canonicalUid,
                      hashPayload({ topics }),
                    ),
                    occurredAt: new Date().toISOString(),
                    payload: { integratorUserId: canonicalUid, topics },
                  });
                }
              }
            }
          });
          await fanoutProjectionsAfterTx(pendingPrefs);
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
          const pendingRule: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, userId);
            const updatedAt = await upsertReminderRule(txDb, {
              id,
              userId: canonicalUserId,
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
              integratorUserId: canonicalUserId,
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
            pendingRule.push({
              eventType: REMINDER_RULE_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(REMINDER_RULE_UPSERTED, id, hashPayload(keyPayload)),
              occurredAt: updatedAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingRule);
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
          const pendingOccSent: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await markReminderOccurrenceSent(txDb, occurrenceId, channel);
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              pendingOccSent.push({
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
          await fanoutProjectionsAfterTx(pendingOccSent);
          return;
        }
        case 'reminders.occurrence.markFailed': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          const pendingOccFail: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await markReminderOccurrenceFailed(
              txDb,
              occurrenceId,
              channel,
              asNullableString(mutation.params.errorCode),
            );
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              pendingOccFail.push({
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
          await fanoutProjectionsAfterTx(pendingOccFail);
          return;
        }
        case 'reminders.occurrence.reschedulePlanned': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const plannedAt = asNonEmptyString(mutation.params.plannedAt);
          if (!occurrenceId || !plannedAt) return;
          await rescheduleReminderOccurrencePlanned(db, occurrenceId, plannedAt);
          return;
        }
        case 'reminders.occurrence.markSkippedLocal': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          if (!occurrenceId) return;
          await markReminderOccurrenceSkippedLocal(db, occurrenceId);
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
          const pendingDelLog: ProjectionFanoutInput[] = [];
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
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorDeliveryLogId: id,
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                channel,
                status,
                errorCode: asNullableString(mutation.params.errorCode),
                payloadJson,
                createdAt,
              };
              pendingDelLog.push({
                eventType: REMINDER_DELIVERY_LOGGED,
                idempotencyKey: projectionIdempotencyKey(REMINDER_DELIVERY_LOGGED, id, hashPayload(payload)),
                occurredAt: createdAt,
                payload,
              });
            }
          });
          await fanoutProjectionsAfterTx(pendingDelLog);
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
          const pendingContent: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, userId);
            const createdAt = await createContentAccessGrant(txDb, {
              id,
              userId: canonicalUserId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              metaJson,
            });
            const payload = {
              integratorGrantId: id,
              integratorUserId: canonicalUserId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              revokedAt: null as string | null,
              metaJson,
              createdAt,
            };
            pendingContent.push({
              eventType: CONTENT_ACCESS_GRANTED,
              idempotencyKey: projectionIdempotencyKey(CONTENT_ACCESS_GRANTED, id, hashPayload(payload)),
              occurredAt: createdAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingContent);
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
          const pendingDal: ProjectionFanoutInput[] = [];
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
            pendingDal.push({
              eventType: 'support.delivery.attempt.logged',
              idempotencyKey: projectionIdempotencyKey('support.delivery.attempt.logged', String(key), hashPayload(payload)),
              occurredAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingDal);
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
          const payload: Record<string, unknown> = {
            integratorTopicId: String(topicId),
            code,
            title,
            key,
            isActive,
            updatedAt,
          };
          await fanoutProjectionsAfterTx([
            {
              eventType: MAILING_TOPIC_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(MAILING_TOPIC_UPSERTED, String(topicId), hashPayload(payload)),
              occurredAt: updatedAt,
              payload,
            },
          ]);
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
          const canonicalUserId = await resolveCanonicalIntegratorUserId(db, String(userId));
          const payload: Record<string, unknown> = {
            integratorUserId: canonicalUserId,
            integratorTopicId: String(topicId),
            isActive,
            updatedAt,
          };
          await fanoutProjectionsAfterTx([
            {
              eventType: USER_SUBSCRIPTION_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(
                USER_SUBSCRIPTION_UPSERTED,
                `${canonicalUserId}:${topicId}`,
                hashPayload(payload),
              ),
              occurredAt: updatedAt,
              payload,
            },
          ]);
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
          const pendingMailLog: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            const canonicalUserIdStr = await resolveCanonicalIntegratorUserId(txDb, String(userId));
            const canonicalUserIdNum = Number(canonicalUserIdStr);
            if (!Number.isFinite(canonicalUserIdNum)) {
              logger.warn(
                { mutationType: mutation.type, canonicalUserIdStr },
                'skip mailing.log.append: canonical integrator user id is not numeric',
              );
              return;
            }
            await insertMailingLog(txDb, {
              userId: canonicalUserIdNum,
              mailingId,
              status,
              sentAt,
              error,
            });
            const payload: Record<string, unknown> = {
              integratorUserId: canonicalUserIdStr,
              integratorMailingId: String(mailingId),
              status,
              sentAt,
              errorText: error,
            };
            pendingMailLog.push({
              eventType: MAILING_LOG_SENT,
              idempotencyKey: projectionIdempotencyKey(
                MAILING_LOG_SENT,
                `${canonicalUserIdStr}:${mailingId}`,
                hashPayload(payload),
              ),
              occurredAt: sentAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingMailLog);
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
