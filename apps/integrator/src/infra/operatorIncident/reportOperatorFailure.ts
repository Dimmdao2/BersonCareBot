import { createHmac } from 'node:crypto';
import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { logger } from '../observability/logger.js';
import { openOrTouchOperatorIncident } from '../db/repos/operatorHealthDrizzle.js';
import { createDbPort } from '../db/client.js';
import { enqueueOutgoingDeliveryIfAbsent } from '../db/repos/outgoingDeliveryQueue.js';
import { OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS } from '../delivery/deliveryContract.js';
import {
  loadAdminMessengerIdLists,
  loadOperatorHealthAlertConfigIntegrator,
} from './operatorHealthAlertConfigIntegrator.js';

export type ReportOperatorFailureInput = {
  /** @deprecated Оставлено для совместимости вызовов; доставка идёт через `outgoing_delivery_queue` / Max API. */
  dispatchPort?: DispatchPort;
  direction: string;
  integration: string;
  errorClass: string;
  errorDetail?: string | null;
  alertLines: string[];
};

export type RecordOperatorFailureIncidentInput = Omit<
  ReportOperatorFailureInput,
  'dispatchPort' | 'alertLines'
>;

function buildDedupKey(direction: string, integration: string, errorClass: string): string {
  return `${direction}:${integration}:${errorClass}`;
}

/**
 * Durable incident-only path for failures that must be consumed by the scheduled critical
 * classifier. It intentionally does not enqueue an immediate alert: the existing dispatcher
 * owns fan-out/dedup, and the incident contains only caller-supplied low-cardinality fields.
 */
export async function recordOperatorFailureIncident(
  input: RecordOperatorFailureIncidentInput,
): Promise<{ id: string; occurrenceCount: number }> {
  return openOrTouchOperatorIncident({
    dedupKey: buildDedupKey(input.direction, input.integration, input.errorClass),
    direction: input.direction,
    integration: input.integration,
    errorClass: input.errorClass,
    errorDetail: input.errorDetail ?? null,
  });
}

function buildRecipientDigest(channel: 'telegram' | 'max', recipientId: string): string {
  const key = process.env.DB_PRINCIPAL_SIGNING_SECRET;
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw new Error(
      'DB_PRINCIPAL_SIGNING_SECRET is required for operator recipient pseudonymization',
    );
  }
  return createHmac('sha256', key)
    .update(`${channel}\0${recipientId}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/** Probe fails: incident only; critical push follows the configured streak gate in the webapp tick. */
const PROBE_ERROR_CLASSES_NO_IMMEDIATE_CRITICAL = new Set([
  'max_probe_failed',
  'telegram_probe_failed',
  'google_calendar_probe_failed',
]);

/**
 * Открыть/обновить операторский инцидент; при первом открытии (occurrence_count === 1) — алерт админам
 * по спискам `admin_telegram_ids` / `admin_max_ids` и `operator_health_alert_config.channels.critical`.
 */
export async function reportOperatorFailure(input: ReportOperatorFailureInput): Promise<void> {
  const dedupKey = buildDedupKey(input.direction, input.integration, input.errorClass);
  const { id: incidentId, occurrenceCount } = await recordOperatorFailureIncident(input);

  if (occurrenceCount !== 1) return;

  if (PROBE_ERROR_CLASSES_NO_IMMEDIATE_CRITICAL.has(input.errorClass)) {
    return;
  }

  /** P8: inbound webhook critical — только burst в webapp critical tick. */
  if (input.direction === 'inbound_webhook') {
    return;
  }

  const db = createDbPort();
  let cfg;
  try {
    cfg = await loadOperatorHealthAlertConfigIntegrator(db);
  } catch (err) {
    logger.warn({ err }, '[operator_incident] load operator_health_alert_config failed');
    return;
  }

  if (!cfg.topics.critical_enabled) return;

  const channels = cfg.channels.critical;
  const text = input.alertLines.join('\n');
  if (!text.trim()) return;

  let lists: { telegram: string[]; max: string[] };
  try {
    lists = await loadAdminMessengerIdLists();
  } catch (err) {
    logger.warn({ err }, '[operator_incident] load admin messenger id lists failed');
    return;
  }

  if (channels.telegram && lists.telegram.length > 0) {
    for (const recipientId of lists.telegram) {
      const chatId = Number(recipientId);
      if (!Number.isFinite(chatId)) continue;
      const recipientDigest = buildRecipientDigest('telegram', recipientId);
      const eventId = `op-alert:${incidentId}:${recipientDigest}:${dedupKey}`.slice(0, 240);
      const intent: OutgoingIntent = {
        type: 'message.send',
        meta: {
          eventId: `op-inc:${dedupKey}:${recipientDigest}`.slice(0, 240),
          occurredAt: new Date().toISOString(),
          source: 'telegram',
        },
        payload: {
          recipient: { chatId },
          message: { text },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      };
      await enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: { incidentId, intent },
        maxAttempts: OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS,
      });
    }
  } else if (channels.telegram) {
    logger.info(
      {
        scope: 'operator_incident',
        event: 'operator_alert_skipped_no_recipients',
        channel: 'telegram',
      },
      'skipped',
    );
  }

  if (channels.max && lists.max.length > 0) {
    for (const recipientId of lists.max) {
      const userId = Number(recipientId);
      if (!Number.isFinite(userId)) continue;
      const recipientDigest = buildRecipientDigest('max', recipientId);
      const eventId = `op-alert:${incidentId}:${recipientDigest}:${dedupKey}`.slice(0, 240);
      const intent: OutgoingIntent = {
        type: 'message.send',
        meta: {
          eventId: `op-inc:${dedupKey}:${recipientDigest}`.slice(0, 240),
          occurredAt: new Date().toISOString(),
          source: 'max',
        },
        payload: {
          recipient: { userId },
          message: { text },
          delivery: { channels: ['max'], maxAttempts: 1 },
        },
      };
      await enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'max',
        payloadJson: { incidentId, intent },
        maxAttempts: OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS,
      });
    }
  } else if (channels.max) {
    logger.info(
      { scope: 'operator_incident', event: 'operator_alert_skipped_no_recipients', channel: 'max' },
      'skipped',
    );
  }
}
