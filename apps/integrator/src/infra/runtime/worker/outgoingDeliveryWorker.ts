import { sql } from 'drizzle-orm';
import { parseCorrelationId, runWithObservabilityContext } from '@bersoncare/db-principal';
import {
  type DbPort,
  type DbWritePort,
  type DeliverySendResult,
  type OutgoingIntent,
} from '../../../kernel/contracts/index.js';
import {
  retryDelaySecondsAfterFailure,
  truncateDeliveryErrorMessage,
  isOutgoingDeliveryDispatchErrorRetryable,
  DOCTOR_BROADCAST_INTENT_QUEUE_KIND,
  INBOUND_REPLY_QUEUE_KIND,
} from '../../delivery/deliveryContract.js';
import {
  classifyRecipientBlockedBotError,
  RECIPIENT_BLOCKED_BOT,
  RECIPIENT_BLOCKED_BOT_FAILURE_CLASS,
} from '../../delivery/recipientBotBlocked.js';
import { logger } from '../../observability/logger.js';
import { recordOperatorFailureIncident } from '../../operatorIncident/reportOperatorFailure.js';
import { classifyOutboundProviderErrorClass } from '@bersoncare/operator-db-schema';
import {
  markOperatorIncidentAlertSent,
  operatorIncidentAlertAlreadySent,
  resolveOutgoingDeliveryScope,
} from '../../db/repos/outgoingDeliveryScope.js';
import {
  claimDueOutgoingDeliveries,
  markOutgoingDeliveryDead,
  markOutgoingDeliverySent,
  rescheduleOutgoingDeliveryRetry,
  resetStaleOutgoingDeliveryProcessing,
  type OutgoingDeliveryQueueRow,
} from '../../db/repos/outgoingDeliveryQueue.js';
import { getOutgoingDeliveryReclaimConfig } from '../../db/repos/outgoingDeliveryReclaimSettings.js';
import {
  enrichDoctorBroadcastIntentIfNeeded,
  type DoctorBroadcastMenuWorkerDeps,
} from './doctorBroadcastIntentMenu.js';
import { recordNotificationDeliveryAttemptBestEffort } from '../../db/repos/notificationDeliveryAttempts.js';
import { resolveReminderOccurrenceOrganizationId } from '../../db/repos/reminders.js';
import { resolveBroadcastAuditOrganizationId } from '../../db/repos/broadcastAudit.js';
import {
  clearUserChannelBotBlocked,
  markUserChannelBotBlocked,
  resolvePlatformUserIdForBotBlockedMarker,
} from '../../db/repos/userChannelBotBlocked.js';
import { runIntegratorSql } from '../../db/runIntegratorSql.js';
import {
  runWithInfraPrincipal,
  runWithOptionalOrganizationPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';
import {
  OUTBOUND_MESSAGE_POLICY_DENIED,
  isOutboundMessagePolicyDenied,
} from '../../adapters/outboundMessagePolicy.js';

export type OutgoingDeliveryWorkerDeps = {
  db: DbPort;
  writePort: DbWritePort;
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  doctorBroadcastMenu?: DoctorBroadcastMenuWorkerDeps;
};

function outgoingDeliveryCorrelationId(row: OutgoingDeliveryQueueRow): string | undefined {
  const intent = row.payloadJson.intent;
  if (intent === null || typeof intent !== 'object') return undefined;
  const meta = (intent as Record<string, unknown>).meta;
  if (meta === null || typeof meta !== 'object') return undefined;
  return parseCorrelationId((meta as Record<string, unknown>).correlationId);
}

function runWithOutgoingDeliveryCorrelation<T>(row: OutgoingDeliveryQueueRow, fn: () => T): T {
  return runWithObservabilityContext({ correlationId: outgoingDeliveryCorrelationId(row) }, fn);
}

function runWithDeliveryQueueCapability<T>(fn: () => T): T {
  return runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, fn);
}

function queueMarkDead(
  db: DbPort,
  id: string,
  error: string,
  failureClass?: string,
): Promise<void> {
  return runWithDeliveryQueueCapability(() =>
    failureClass === undefined
      ? markOutgoingDeliveryDead(db, id, error)
      : markOutgoingDeliveryDead(db, id, error, failureClass),
  );
}

function queueMarkSent(db: DbPort, id: string): Promise<void> {
  return runWithDeliveryQueueCapability(() => markOutgoingDeliverySent(db, id));
}

function queueReschedule(
  db: DbPort,
  id: string,
  delaySeconds: number,
  error: string,
): Promise<void> {
  return runWithDeliveryQueueCapability(() =>
    rescheduleOutgoingDeliveryRetry(db, id, delaySeconds, error),
  );
}

async function finalizeClaimedRowFailure(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const safeError = truncateDeliveryErrorMessage(message);
  if (row.attemptCount >= row.maxAttempts) {
    await queueMarkDead(db, row.id, safeError);
    return;
  }
  await queueReschedule(
    db,
    row.id,
    retryDelaySecondsAfterFailure(row.attemptCount, row.kind),
    safeError,
  );
}

function asChatIdFromRecipient(recipient: unknown): number | null {
  if (!recipient || typeof recipient !== 'object') return null;
  const c = (recipient as { chatId?: unknown }).chatId;
  if (typeof c === 'number' && Number.isFinite(c)) return Math.trunc(c);
  if (typeof c === 'string' && c.trim().length > 0) {
    const n = Number(c.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function parseIntentFromPayload(payload: Record<string, unknown>): OutgoingIntent | null {
  const rawIntent = payload.intent;
  if (!rawIntent || typeof rawIntent !== 'object') return null;
  const o = rawIntent as Record<string, unknown>;
  if (typeof o.type !== 'string') return null;
  const metaRaw = o.meta;
  if (!metaRaw || typeof metaRaw !== 'object') return null;
  const meta = metaRaw as Record<string, unknown>;
  if (
    typeof meta.eventId !== 'string' ||
    typeof meta.occurredAt !== 'string' ||
    typeof meta.source !== 'string'
  ) {
    return null;
  }
  const pl = o.payload;
  if (!pl || typeof pl !== 'object') return null;
  return {
    type: o.type as OutgoingIntent['type'],
    meta: {
      eventId: meta.eventId,
      occurredAt: meta.occurredAt,
      source: meta.source,
      ...(typeof meta.correlationId === 'string' ? { correlationId: meta.correlationId } : {}),
      ...(typeof meta.userId === 'string' ? { userId: meta.userId } : {}),
    },
    payload: pl as Record<string, unknown>,
  };
}

function isMissingReminderOccurrenceFk(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code =
    typeof e.code === 'string' ? e.code : typeof e.cause?.code === 'string' ? e.cause.code : '';
  const constraint = typeof e.cause?.constraint === 'string' ? e.cause.constraint : '';
  return code === '23503' && constraint === 'user_reminder_delivery_logs_occurrence_id_fkey';
}

function maskRecipientForDoctorBroadcastLog(channel: string, intent: OutgoingIntent): string {
  const pl = intent.payload;
  const r = pl?.recipient;
  if (!r || typeof r !== 'object') return '—';
  const rec = r as Record<string, unknown>;
  if (channel === 'sms') {
    const phone = typeof rec.phoneNormalized === 'string' ? rec.phoneNormalized : '';
    const d = phone.replace(/\D/g, '');
    if (d.length < 4) return 'tel:****';
    return `tel:…${d.slice(-4)}`;
  }
  const cid = rec.chatId;
  if (typeof cid === 'number' && Number.isFinite(cid)) {
    return `${channel}:…${String(Math.trunc(cid)).slice(-4)}`;
  }
  if (typeof cid === 'string' && cid.trim().length > 0) {
    const t = cid.trim();
    return `${channel}:…${t.slice(-4)}`;
  }
  return `${channel}:…`;
}

async function incrementBroadcastAuditErrorIfDoctorBroadcast(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
): Promise<void> {
  if (row.kind !== DOCTOR_BROADCAST_INTENT_QUEUE_KIND) return;
  const auditId =
    typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : null;
  if (!auditId) return;
  await runWithBroadcastAuditOrganization(db, auditId, (targetDb) =>
    runIntegratorSql(
      targetDb,
      sql`UPDATE public.broadcast_audit SET error_count = error_count + 1 WHERE id = ${auditId}::uuid`,
    ),
  );
}

async function incrementBroadcastAuditBlockedIfDoctorBroadcast(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
): Promise<void> {
  if (row.kind !== DOCTOR_BROADCAST_INTENT_QUEUE_KIND) return;
  const auditId =
    typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : null;
  if (!auditId) return;
  await runWithBroadcastAuditOrganization(db, auditId, (targetDb) =>
    runIntegratorSql(
      targetDb,
      sql`UPDATE public.broadcast_audit SET blocked_recipient_count = blocked_recipient_count + 1 WHERE id = ${auditId}::uuid`,
    ),
  );
}

function resolveExternalIdForBotBlockedMarker(
  row: OutgoingDeliveryQueueRow,
  intent: OutgoingIntent,
): string | null {
  const p = row.payloadJson;
  const fromPayload = typeof p.externalId === 'string' ? p.externalId.trim() : '';
  if (fromPayload.length > 0) return fromPayload;
  const sendPayload = intent.payload as { recipient?: { chatId?: unknown } };
  const chatId = sendPayload.recipient?.chatId;
  if (typeof chatId === 'number' && Number.isFinite(chatId)) return String(Math.trunc(chatId));
  if (typeof chatId === 'string' && chatId.trim().length > 0) return chatId.trim();
  return null;
}

async function maybeClearMessengerBotBlockedMarker(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  intent: OutgoingIntent,
): Promise<void> {
  if (row.channel !== 'telegram' && row.channel !== 'max') return;
  await clearUserChannelBotBlocked(db, {
    platformUserId: resolvePlatformUserIdForBotBlockedMarker({
      metaUserId: intent.meta.userId,
      payloadJson: row.payloadJson,
    }),
    channel: row.channel,
    externalId: resolveExternalIdForBotBlockedMarker(row, intent),
  });
}

async function readReminderOccurrenceStatus(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ status: string }>(
    db,
    sql`SELECT status::text AS status FROM user_reminder_occurrences WHERE id = ${occurrenceId} LIMIT 1`,
  );
  return typeof res.rows[0]?.status === 'string' ? res.rows[0]!.status : null;
}

async function runWithReminderOccurrenceOrganization<T>(
  db: DbPort,
  occurrenceId: string,
  fn: () => T,
): Promise<T> {
  const organizationId = await resolveReminderOccurrenceOrganizationId(db, occurrenceId);
  return await runWithOptionalOrganizationPrincipal(organizationId, fn);
}

async function runWithBroadcastAuditOrganization<T>(
  db: DbPort,
  broadcastAuditId: string,
  fn: (targetDb: DbPort) => Promise<T>,
): Promise<T> {
  const organizationId = await resolveBroadcastAuditOrganizationId(db, broadcastAuditId);
  if (organizationId && db.integratorDrizzle === undefined) {
    return await runWithOrganizationPrincipal(organizationId, () => db.tx((txDb) => fn(txDb)));
  }
  return await runWithOptionalOrganizationPrincipal(organizationId, () => fn(db));
}

/**
 * D35 п.2: временный отказ живого канала, исчерпавший попытки короткой лестницы `inbound_reply`,
 * обязан породить видимый инцидент — это единственный путь, где человек ждёт ответа прямо сейчас.
 * Постоянный отказ (бот заблокирован) сюда не попадает: он финализируется раньше, в
 * `finalizeRecipientBlockedBotDelivery`, и инцидента намеренно не создаёт (п.1 — нормальное
 * состояние, не деградация).
 */
async function recordInboundReplyDeliveryDeadIncident(
  row: OutgoingDeliveryQueueRow,
  safeError: string,
): Promise<void> {
  if (row.kind !== INBOUND_REPLY_QUEUE_KIND) return;
  try {
    await recordOperatorFailureIncident({
      direction: 'inbound_reply',
      integration: row.channel,
      errorClass: classifyOutboundProviderErrorClass(safeError),
      errorDetail: null,
    });
  } catch (err) {
    logger.warn(
      { err, rowId: row.id, eventId: row.eventId },
      'inbound_reply_delivery_dead_incident_record_failed',
    );
  }
}

async function finalizeOutgoingDeliveryDead(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  safeError: string,
  writePort: DbWritePort,
): Promise<void> {
  await queueMarkDead(db, row.id, safeError);
  await recordInboundReplyDeliveryDeadIncident(row, safeError);
  await incrementBroadcastAuditErrorIfDoctorBroadcast(db, row);
  if (row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND) {
    const auditId =
      typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : '';
    logger.warn(
      {
        broadcastAuditId: auditId || undefined,
        eventId: row.eventId,
        channel: row.channel,
        outcome: 'dead',
        error: truncateDeliveryErrorMessage(safeError),
      },
      'doctor_broadcast_delivery.dead',
    );
  }
  if (row.kind === 'reminder_dispatch') {
    const p = row.payloadJson;
    const occurrenceId = typeof p.occurrenceId === 'string' ? p.occurrenceId : null;
    const channel = typeof p.channel === 'string' ? p.channel : null;
    const deliveryLogId = typeof p.deliveryLogId === 'string' ? p.deliveryLogId : null;
    const externalId = typeof p.externalId === 'string' ? p.externalId : '';
    const text = typeof p.logText === 'string' ? p.logText : '';
    if (occurrenceId && channel && deliveryLogId) {
      const occStatus = await readReminderOccurrenceStatus(db, occurrenceId);
      if (!occStatus) {
        logger.warn(
          { occurrenceId, rowId: row.id, eventId: row.eventId },
          'finalize_delivery_dead_skip_missing_occurrence',
        );
        return;
      }
      try {
        await runWithReminderOccurrenceOrganization(db, occurrenceId, async () => {
          await writePort.writeDb({
            type: 'reminders.delivery.log',
            params: {
              id: deliveryLogId,
              occurrenceId,
              channel,
              status: 'failed',
              errorCode: 'DELIVERY_DEAD',
              payloadJson: { chatId: externalId, text },
            },
          });
          await writePort.writeDb({
            type: 'reminders.occurrence.markFailed',
            params: { occurrenceId, channel, errorCode: 'DELIVERY_DEAD' },
          });
        });
      } catch (err) {
        if (isMissingReminderOccurrenceFk(err)) {
          logger.warn(
            { occurrenceId, rowId: row.id, eventId: row.eventId },
            'finalize_delivery_dead_skip_missing_occurrence_fk',
          );
          return;
        }
        throw err;
      }
    }
  }
}

async function recordMessengerQueueDeliveryAttempt(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  intent: OutgoingIntent,
  params: {
    status: 'success' | 'failed' | 'skipped';
    reason?: string;
    errorMessage?: string;
    providerStatusCode?: number;
  },
): Promise<void> {
  if (row.channel !== 'telegram' && row.channel !== 'max') return;
  const p = row.payloadJson;
  const occurrenceId = typeof p.occurrenceId === 'string' ? p.occurrenceId : undefined;
  const externalId = typeof p.externalId === 'string' ? p.externalId : undefined;
  const integratorUserId = typeof intent.meta.userId === 'string' ? intent.meta.userId : undefined;
  const topicCode = typeof p.topicCode === 'string' ? p.topicCode : undefined;
  const broadcastAuditId =
    typeof row.payloadJson.broadcastAuditId === 'string' &&
    row.payloadJson.broadcastAuditId.trim().length > 0
      ? row.payloadJson.broadcastAuditId.trim()
      : null;
  const organizationId =
    row.kind === 'reminder_dispatch' && occurrenceId
      ? await resolveReminderOccurrenceOrganizationId(db, occurrenceId)
      : row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND
        ? broadcastAuditId
          ? await resolveBroadcastAuditOrganizationId(db, broadcastAuditId)
          : null
        : null;
  await recordNotificationDeliveryAttemptBestEffort(db, {
    ...(integratorUserId !== undefined ? { integratorUserId } : {}),
    ...(topicCode !== undefined ? { topicCode } : {}),
    intentType: row.kind === 'reminder_dispatch' ? 'reminder_dispatch' : row.kind,
    channel: row.channel,
    status: params.status,
    ...(params.reason !== undefined ? { reason: params.reason } : {}),
    ...(params.providerStatusCode !== undefined
      ? { providerStatusCode: params.providerStatusCode }
      : {}),
    eventId: row.eventId,
    ...(occurrenceId !== undefined ? { occurrenceId } : {}),
    ...(externalId ? { recipientRef: `${row.channel}:${externalId.slice(-4)}` } : {}),
    ...(params.errorMessage !== undefined ? { errorMessage: params.errorMessage } : {}),
    organizationId,
  });
}

async function finalizeRecipientBlockedBotDelivery(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  intent: OutgoingIntent,
  safeError: string,
  writePort: DbWritePort,
): Promise<void> {
  await markUserChannelBotBlocked(db, {
    platformUserId: resolvePlatformUserIdForBotBlockedMarker({
      metaUserId: intent.meta.userId,
      payloadJson: row.payloadJson,
    }),
    channel: row.channel,
    externalId: resolveExternalIdForBotBlockedMarker(row, intent),
  });
  await recordMessengerQueueDeliveryAttempt(db, row, intent, {
    status: 'skipped',
    reason: 'recipient_blocked_bot',
    errorMessage: safeError,
  });
  await queueMarkDead(db, row.id, safeError, RECIPIENT_BLOCKED_BOT_FAILURE_CLASS);
  await incrementBroadcastAuditBlockedIfDoctorBroadcast(db, row);

  if (row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND) {
    const auditId =
      typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : '';
    logger.info(
      {
        broadcastAuditId: auditId || undefined,
        eventId: row.eventId,
        channel: row.channel,
        outcome: 'blocked',
        error: truncateDeliveryErrorMessage(safeError),
      },
      'doctor_broadcast_delivery.blocked',
    );
  }

  if (row.kind === 'reminder_dispatch') {
    const p = row.payloadJson;
    const occurrenceId = typeof p.occurrenceId === 'string' ? p.occurrenceId : null;
    const channel = typeof p.channel === 'string' ? p.channel : null;
    const deliveryLogId = typeof p.deliveryLogId === 'string' ? p.deliveryLogId : null;
    const externalId = typeof p.externalId === 'string' ? p.externalId : '';
    const text = typeof p.logText === 'string' ? p.logText : '';
    if (occurrenceId && channel && deliveryLogId) {
      const occStatus = await readReminderOccurrenceStatus(db, occurrenceId);
      if (!occStatus) {
        logger.warn(
          { occurrenceId, rowId: row.id, eventId: row.eventId },
          'finalize_delivery_blocked_skip_missing_occurrence',
        );
        return;
      }
      try {
        await runWithReminderOccurrenceOrganization(db, occurrenceId, async () => {
          await writePort.writeDb({
            type: 'reminders.delivery.log',
            params: {
              id: deliveryLogId,
              occurrenceId,
              channel,
              status: 'failed',
              errorCode: RECIPIENT_BLOCKED_BOT,
              payloadJson: { chatId: externalId, text },
            },
          });
          await writePort.writeDb({
            type: 'reminders.occurrence.markSkippedLocal',
            params: { occurrenceId },
          });
        });
      } catch (err) {
        if (isMissingReminderOccurrenceFk(err)) {
          logger.warn(
            { occurrenceId, rowId: row.id, eventId: row.eventId },
            'finalize_delivery_blocked_skip_missing_occurrence_fk',
          );
          return;
        }
        throw err;
      }
    }
  }
}

async function handleDispatchFailure(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  err: unknown,
  writePort: DbWritePort,
  intent?: OutgoingIntent,
): Promise<void> {
  if (
    row.kind !== 'operator_alert' &&
    intent &&
    (row.channel === 'telegram' || row.channel === 'max')
  ) {
    const blocked = classifyRecipientBlockedBotError(err, row.channel);
    if (blocked) {
      await finalizeRecipientBlockedBotDelivery(
        db,
        row,
        intent,
        truncateDeliveryErrorMessage(blocked.message),
        writePort,
      );
      return;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  const safe = truncateDeliveryErrorMessage(msg);
  const attempts = row.attemptCount;
  const retryable = isOutgoingDeliveryDispatchErrorRetryable(safe);
  if (!retryable || attempts >= row.maxAttempts) {
    if (
      row.kind !== 'operator_alert' &&
      intent &&
      (row.channel === 'telegram' || row.channel === 'max')
    ) {
      await recordMessengerQueueDeliveryAttempt(db, row, intent, {
        status: 'failed',
        reason: retryable ? 'delivery_dead' : 'provider_error',
        errorMessage: safe,
      });
    }
    await finalizeOutgoingDeliveryDead(db, row, safe, writePort);
    return;
  }
  const delay = retryDelaySecondsAfterFailure(attempts, row.kind);
  await queueReschedule(db, row.id, delay, safe);
}

async function finalizeOutboundPolicyDenied(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
): Promise<void> {
  // This is a local topology decision, not a provider failure: do not retry, write a
  // messenger attempt, or touch bot-block state. The queue row retains only a stable code.
  await queueMarkDead(db, row.id, OUTBOUND_MESSAGE_POLICY_DENIED);
  await incrementBroadcastAuditErrorIfDoctorBroadcast(db, row);
  logger.warn(
    { rowId: row.id, eventId: row.eventId, kind: row.kind, channel: row.channel },
    'outgoing_delivery_egress_policy_denied',
  );
}

export async function processOutgoingDeliveryRow(
  row: OutgoingDeliveryQueueRow,
  deps: OutgoingDeliveryWorkerDeps,
): Promise<void> {
  const { db, writePort, dispatchOutgoing, doctorBroadcastMenu } = deps;
  const intent = parseIntentFromPayload(row.payloadJson);
  if (!intent) {
    await queueMarkDead(db, row.id, 'BAD_PAYLOAD');
    await incrementBroadcastAuditErrorIfDoctorBroadcast(db, row);
    return;
  }

  if (row.kind === 'operator_alert') {
    const incidentId =
      typeof row.payloadJson.incidentId === 'string' ? row.payloadJson.incidentId : null;
    if (!incidentId) {
      await queueMarkDead(db, row.id, 'MISSING_INCIDENT_ID');
      return;
    }
    if (await operatorIncidentAlertAlreadySent(db, incidentId)) {
      await queueMarkSent(db, row.id);
      return;
    }
    try {
      await dispatchOutgoing(intent);
      await queueMarkSent(db, row.id);
      try {
        await markOperatorIncidentAlertSent(db, incidentId);
      } catch (error) {
        logger.error(
          { error, incidentId, rowId: row.id },
          'operator_alert_mark_sent_failed_after_delivery',
        );
      }
    } catch (err) {
      if (isOutboundMessagePolicyDenied(err)) {
        await finalizeOutboundPolicyDenied(db, row);
        return;
      }
      await handleDispatchFailure(db, row, err, writePort, intent);
    }
    return;
  }

  if (row.kind === INBOUND_REPLY_QUEUE_KIND) {
    try {
      await dispatchOutgoing(intent);
      await recordMessengerQueueDeliveryAttempt(db, row, intent, { status: 'success' });
      await maybeClearMessengerBotBlockedMarker(db, row, intent);
      await queueMarkSent(db, row.id);
    } catch (err) {
      if (isOutboundMessagePolicyDenied(err)) {
        await finalizeOutboundPolicyDenied(db, row);
        return;
      }
      await handleDispatchFailure(db, row, err, writePort, intent);
    }
    return;
  }

  if (row.kind === 'reminder_dispatch') {
    const p = row.payloadJson;
    const occurrenceId = typeof p.occurrenceId === 'string' ? p.occurrenceId : null;
    const channel = typeof p.channel === 'string' ? p.channel : null;
    const deliveryLogId = typeof p.deliveryLogId === 'string' ? p.deliveryLogId : null;
    const externalId = typeof p.externalId === 'string' ? p.externalId : '';
    const text = typeof p.logText === 'string' ? p.logText : '';
    if (!occurrenceId || !channel || !deliveryLogId) {
      await queueMarkDead(db, row.id, 'MISSING_REMINDER_FIELDS');
      return;
    }
    const occStatus = await readReminderOccurrenceStatus(db, occurrenceId);
    if (occStatus === 'sent' || occStatus === 'skipped' || occStatus === 'failed') {
      await queueMarkSent(db, row.id);
      return;
    }
    try {
      const sendPayload = intent.payload as { recipient?: { chatId?: unknown } };
      const chatIdForDel = asChatIdFromRecipient(sendPayload.recipient);
      const unified = p.deleteBeforeSendMessageId;
      const legacyTg = p.deleteBeforeSendTelegramMessageId;
      const staleStr =
        typeof unified === 'string' && unified.trim().length > 0
          ? unified.trim()
          : typeof legacyTg === 'number' && Number.isFinite(legacyTg)
            ? String(Math.trunc(legacyTg))
            : typeof legacyTg === 'string' && /^\d+$/.test(legacyTg.trim())
              ? legacyTg.trim()
              : null;
      if (staleStr && chatIdForDel !== null) {
        if (channel === 'telegram') {
          const staleMid = Number(staleStr);
          if (Number.isFinite(staleMid) && staleMid > 0) {
            try {
              await dispatchOutgoing({
                type: 'message.delete',
                meta: {
                  eventId: `${row.eventId}:stale_delete`,
                  occurredAt: new Date().toISOString(),
                  source: 'telegram',
                  ...(typeof intent.meta.userId === 'string' ? { userId: intent.meta.userId } : {}),
                },
                payload: {
                  recipient: { chatId: chatIdForDel },
                  messageId: staleMid,
                  delivery: { channels: ['telegram'], maxAttempts: 1 },
                },
              });
            } catch (err) {
              logger.warn({ err, staleMid, occurrenceId }, 'reminder_stale_message_delete_failed');
            }
          }
        } else if (channel === 'max') {
          try {
            await dispatchOutgoing({
              type: 'message.delete',
              meta: {
                eventId: `${row.eventId}:stale_delete`,
                occurredAt: new Date().toISOString(),
                source: 'max',
                ...(typeof intent.meta.userId === 'string' ? { userId: intent.meta.userId } : {}),
              },
              payload: {
                recipient: { chatId: chatIdForDel },
                messageId: staleStr,
                delivery: { channels: ['max'], maxAttempts: 1 },
              },
            });
          } catch (err) {
            logger.warn(
              { err, staleMessageId: staleStr, occurrenceId },
              'max_reminder_stale_message_delete_failed',
            );
          }
        }
      }

      const sendResult = await dispatchOutgoing(intent);
      const telegramMessageId =
        channel === 'telegram' && typeof sendResult?.telegramMessageId === 'number'
          ? sendResult.telegramMessageId
          : undefined;
      const maxMessageId =
        channel === 'max' &&
        typeof sendResult?.maxMessageId === 'string' &&
        sendResult.maxMessageId.trim().length > 0
          ? sendResult.maxMessageId.trim()
          : undefined;
      await runWithReminderOccurrenceOrganization(db, occurrenceId, async () => {
        await writePort.writeDb({
          type: 'reminders.delivery.log',
          params: {
            id: deliveryLogId,
            occurrenceId,
            channel,
            status: 'success',
            payloadJson: {
              chatId: externalId,
              text,
              ...(telegramMessageId !== undefined
                ? { telegramMessageId: String(Math.trunc(telegramMessageId)) }
                : {}),
              ...(maxMessageId !== undefined ? { maxMessageId } : {}),
            },
          },
        });
        await writePort.writeDb({
          type: 'reminders.occurrence.markSent',
          params: { occurrenceId, channel },
        });
      });
      await recordMessengerQueueDeliveryAttempt(db, row, intent, { status: 'success' });
      await maybeClearMessengerBotBlockedMarker(db, row, intent);
      await queueMarkSent(db, row.id);
    } catch (err) {
      if (isOutboundMessagePolicyDenied(err)) {
        await finalizeOutboundPolicyDenied(db, row);
        return;
      }
      await handleDispatchFailure(db, row, err, writePort, intent);
    }
    return;
  }

  if (row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND) {
    const broadcastAuditId =
      typeof row.payloadJson.broadcastAuditId === 'string'
        ? row.payloadJson.broadcastAuditId
        : null;
    if (!broadcastAuditId) {
      await queueMarkDead(db, row.id, 'MISSING_BROADCAST_AUDIT_ID');
      return;
    }
    const maskedRecipient = maskRecipientForDoctorBroadcastLog(row.channel, intent);
    let toSend: OutgoingIntent = intent;
    try {
      toSend =
        doctorBroadcastMenu !== undefined
          ? await enrichDoctorBroadcastIntentIfNeeded({
              db,
              row,
              intent,
              menu: doctorBroadcastMenu,
            })
          : intent;
      await dispatchOutgoing(toSend);
      await recordMessengerQueueDeliveryAttempt(db, row, toSend, { status: 'success' });
      await maybeClearMessengerBotBlockedMarker(db, row, toSend);
      await queueMarkSent(db, row.id);
      await runWithBroadcastAuditOrganization(db, broadcastAuditId, (targetDb) =>
        runIntegratorSql(
          targetDb,
          sql`UPDATE public.broadcast_audit SET sent_count = sent_count + 1 WHERE id = ${broadcastAuditId}::uuid`,
        ),
      );
      logger.info(
        {
          broadcastAuditId,
          eventId: row.eventId,
          channel: row.channel,
          outcome: 'sent',
          recipient: maskedRecipient,
        },
        'doctor_broadcast_delivery.sent',
      );
    } catch (err) {
      if (isOutboundMessagePolicyDenied(err)) {
        await finalizeOutboundPolicyDenied(db, row);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const safeErr = truncateDeliveryErrorMessage(msg);
      const attempts = row.attemptCount;
      const willRetry =
        isOutgoingDeliveryDispatchErrorRetryable(safeErr) && attempts < row.maxAttempts;
      if (willRetry) {
        logger.debug(
          {
            broadcastAuditId,
            eventId: row.eventId,
            channel: row.channel,
            recipient: maskedRecipient,
            error: safeErr,
            attempt: attempts,
          },
          'doctor_broadcast_delivery.dispatch_will_retry',
        );
      }
      await handleDispatchFailure(db, row, err, writePort, toSend);
    }
    return;
  }

  await queueMarkDead(db, row.id, `UNKNOWN_KIND:${row.kind}`);
}

export async function processClaimedOutgoingDeliveryRow(
  row: OutgoingDeliveryQueueRow,
  deps: OutgoingDeliveryWorkerDeps,
): Promise<void> {
  return runWithOutgoingDeliveryCorrelation(row, () =>
    processClaimedOutgoingDeliveryRowInner(row, deps),
  );
}

async function processClaimedOutgoingDeliveryRowInner(
  row: OutgoingDeliveryQueueRow,
  deps: OutgoingDeliveryWorkerDeps,
): Promise<void> {
  const scope = await resolveOutgoingDeliveryScope(deps.db, row.id);
  if (scope.queueKind !== row.kind) {
    await queueMarkDead(deps.db, row.id, 'TENANT_SCOPE_QUEUE_KIND_MISMATCH');
    logger.error(
      { rowId: row.id, eventId: row.eventId, claimedKind: row.kind, resolvedKind: scope.queueKind },
      'outgoing_delivery_scope_quarantined',
    );
    return;
  }
  if (scope.kind === 'invalid') {
    const reason = truncateDeliveryErrorMessage(`TENANT_SCOPE_${scope.reason.toUpperCase()}`);
    await queueMarkDead(deps.db, row.id, reason);
    logger.error(
      { rowId: row.id, eventId: row.eventId, queueKind: row.kind, reason: scope.reason },
      'outgoing_delivery_scope_quarantined',
    );
    return;
  }
  if (scope.kind === 'operator') {
    await processOutgoingDeliveryRow(row, deps);
    return;
  }
  await runWithOrganizationPrincipal(scope.organizationId, () =>
    processOutgoingDeliveryRow(row, deps),
  );
}

export async function runOutgoingDeliveryWorkerTick(input: {
  db: DbPort;
  writePort: DbWritePort;
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  batchSize: number;
  doctorBroadcastMenu?: DoctorBroadcastMenuWorkerDeps;
}): Promise<{ claimed: number; processed: number; errors: number }> {
  // The claim/reset step below is tenant-agnostic dispatch (rows were already org-filtered at
  // enqueue time); wrap the whole tick in infra when DB_PRINCIPAL_CONTEXT_MODE is locked, so it doesn't reject
  // the connection before per-row processing gets a chance to install its own org principal.
  return runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
    runOutgoingDeliveryWorkerTickInner(input),
  );
}

async function runOutgoingDeliveryWorkerTickInner(input: {
  db: DbPort;
  writePort: DbWritePort;
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  batchSize: number;
  doctorBroadcastMenu?: DoctorBroadcastMenuWorkerDeps;
}): Promise<{ claimed: number; processed: number; errors: number }> {
  const reclaimConfig = await getOutgoingDeliveryReclaimConfig(input.db);
  await resetStaleOutgoingDeliveryProcessing(
    input.db,
    reclaimConfig.processingTimeoutMinutes,
    reclaimConfig.maxReclaimCount,
  );
  const rows = await claimDueOutgoingDeliveries(input.db, input.batchSize);
  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    await runWithOutgoingDeliveryCorrelation(row, async () => {
      try {
        await processClaimedOutgoingDeliveryRowInner(row, {
          db: input.db,
          writePort: input.writePort,
          dispatchOutgoing: input.dispatchOutgoing,
          ...(input.doctorBroadcastMenu !== undefined
            ? { doctorBroadcastMenu: input.doctorBroadcastMenu }
            : {}),
        });
        processed += 1;
      } catch (err) {
        errors += 1;
        logger.error(
          { err, rowId: row.id, eventId: row.eventId },
          'outgoing_delivery_worker_row_failed',
        );
        try {
          await finalizeClaimedRowFailure(input.db, row, err);
        } catch (finalizeError) {
          logger.error(
            { err: finalizeError, rowId: row.id, eventId: row.eventId },
            'outgoing_delivery_worker_row_failure_finalize_failed',
          );
        }
      }
    });
  }
  return { claimed: rows.length, processed, errors };
}
