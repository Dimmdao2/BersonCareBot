import type { DbPort, DbWritePort, DeliverySendResult, OutgoingIntent } from '../../../kernel/contracts/index.js';
import {
  retryDelaySecondsAfterFailure,
  truncateDeliveryErrorMessage,
  isOutgoingDeliveryDispatchErrorRetryable,
  DOCTOR_BROADCAST_INTENT_QUEUE_KIND,
} from '../../delivery/deliveryContract.js';
import { logger } from '../../observability/logger.js';
import {
  getOperatorIncidentAlertState,
  markOperatorIncidentAlertSent,
} from '../../db/repos/operatorHealthDrizzle.js';
import {
  claimDueOutgoingDeliveries,
  markOutgoingDeliveryDead,
  markOutgoingDeliverySent,
  rescheduleOutgoingDeliveryRetry,
  resetStaleOutgoingDeliveryProcessing,
  type OutgoingDeliveryQueueRow,
} from '../../db/repos/outgoingDeliveryQueue.js';

export type OutgoingDeliveryWorkerDeps = {
  db: DbPort;
  writePort: DbWritePort;
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
};

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
  if (typeof meta.eventId !== 'string' || typeof meta.occurredAt !== 'string' || typeof meta.source !== 'string') {
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
  const auditId = typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : null;
  if (!auditId) return;
  await db.query(`UPDATE public.broadcast_audit SET error_count = error_count + 1 WHERE id = $1::uuid`, [auditId]);
}

async function readOperatorAlertAlreadySent(incidentId: string): Promise<boolean> {
  const row = await getOperatorIncidentAlertState(incidentId);
  return Boolean(row?.alertSentAt);
}

async function readReminderOccurrenceStatus(db: DbPort, occurrenceId: string): Promise<string | null> {
  const res = await db.query<{ status: string }>(
    `SELECT status::text AS status FROM user_reminder_occurrences WHERE id = $1 LIMIT 1`,
    [occurrenceId],
  );
  return typeof res.rows[0]?.status === 'string' ? res.rows[0]!.status : null;
}

async function finalizeOutgoingDeliveryDead(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  safeError: string,
  writePort: DbWritePort,
): Promise<void> {
  await markOutgoingDeliveryDead(db, row.id, safeError);
  await incrementBroadcastAuditErrorIfDoctorBroadcast(db, row);
  if (row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND) {
    const auditId = typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : '';
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
    }
  }
}

async function handleDispatchFailure(
  db: DbPort,
  row: OutgoingDeliveryQueueRow,
  err: unknown,
  writePort: DbWritePort,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const safe = truncateDeliveryErrorMessage(msg);
  const attempts = row.attemptCount;
  const retryable = isOutgoingDeliveryDispatchErrorRetryable(safe);
  if (!retryable || attempts >= row.maxAttempts) {
    await finalizeOutgoingDeliveryDead(db, row, safe, writePort);
    return;
  }
  const delay = retryDelaySecondsAfterFailure(attempts);
  await rescheduleOutgoingDeliveryRetry(db, row.id, delay, safe);
}

export async function processOutgoingDeliveryRow(
  row: OutgoingDeliveryQueueRow,
  deps: OutgoingDeliveryWorkerDeps,
): Promise<void> {
  const { db, writePort, dispatchOutgoing } = deps;
  const intent = parseIntentFromPayload(row.payloadJson);
  if (!intent) {
    await markOutgoingDeliveryDead(db, row.id, 'BAD_PAYLOAD');
    await incrementBroadcastAuditErrorIfDoctorBroadcast(db, row);
    return;
  }

  if (row.kind === 'operator_alert') {
    const incidentId = typeof row.payloadJson.incidentId === 'string' ? row.payloadJson.incidentId : null;
    if (!incidentId) {
      await markOutgoingDeliveryDead(db, row.id, 'MISSING_INCIDENT_ID');
      return;
    }
    if (await readOperatorAlertAlreadySent(incidentId)) {
      await markOutgoingDeliverySent(db, row.id);
      return;
    }
    try {
      await dispatchOutgoing(intent);
      await markOperatorIncidentAlertSent(incidentId);
      await markOutgoingDeliverySent(db, row.id);
    } catch (err) {
      await handleDispatchFailure(db, row, err, writePort);
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
      await markOutgoingDeliveryDead(db, row.id, 'MISSING_REMINDER_FIELDS');
      return;
    }
    const occStatus = await readReminderOccurrenceStatus(db, occurrenceId);
    if (occStatus === 'sent' || occStatus === 'skipped' || occStatus === 'failed') {
      await markOutgoingDeliverySent(db, row.id);
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
            logger.warn({ err, staleMessageId: staleStr, occurrenceId }, 'max_reminder_stale_message_delete_failed');
          }
        }
      }

      const sendResult = await dispatchOutgoing(intent);
      const telegramMessageId =
        channel === 'telegram' && typeof sendResult?.telegramMessageId === 'number'
          ? sendResult.telegramMessageId
          : undefined;
      const maxMessageId =
        channel === 'max' && typeof sendResult?.maxMessageId === 'string' && sendResult.maxMessageId.trim().length > 0
          ? sendResult.maxMessageId.trim()
          : undefined;
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
      await markOutgoingDeliverySent(db, row.id);
    } catch (err) {
      await handleDispatchFailure(db, row, err, writePort);
    }
    return;
  }

  if (row.kind === DOCTOR_BROADCAST_INTENT_QUEUE_KIND) {
    const broadcastAuditId =
      typeof row.payloadJson.broadcastAuditId === 'string' ? row.payloadJson.broadcastAuditId : null;
    if (!broadcastAuditId) {
      await markOutgoingDeliveryDead(db, row.id, 'MISSING_BROADCAST_AUDIT_ID');
      return;
    }
    const maskedRecipient = maskRecipientForDoctorBroadcastLog(row.channel, intent);
    try {
      await dispatchOutgoing(intent);
      await markOutgoingDeliverySent(db, row.id);
      await db.query(`UPDATE public.broadcast_audit SET sent_count = sent_count + 1 WHERE id = $1::uuid`, [
        broadcastAuditId,
      ]);
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
      logger.warn(
        {
          err,
          broadcastAuditId,
          eventId: row.eventId,
          channel: row.channel,
          recipient: maskedRecipient,
        },
        'doctor_broadcast_delivery.dispatch_failed',
      );
      await handleDispatchFailure(db, row, err, writePort);
    }
    return;
  }

  await markOutgoingDeliveryDead(db, row.id, `UNKNOWN_KIND:${row.kind}`);
}

export async function runOutgoingDeliveryWorkerTick(input: {
  db: DbPort;
  writePort: DbWritePort;
  dispatchOutgoing: (intent: OutgoingIntent) => Promise<DeliverySendResult>;
  batchSize: number;
}): Promise<{ claimed: number; processed: number; errors: number }> {
  await resetStaleOutgoingDeliveryProcessing(input.db, 10);
  const rows = await claimDueOutgoingDeliveries(input.db, input.batchSize);
  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      await processOutgoingDeliveryRow(row, {
        db: input.db,
        writePort: input.writePort,
        dispatchOutgoing: input.dispatchOutgoing,
      });
      processed += 1;
    } catch (err) {
      errors += 1;
      logger.error({ err, rowId: row.id, eventId: row.eventId }, 'outgoing_delivery_worker_row_failed');
    }
  }
  return { claimed: rows.length, processed, errors };
}
