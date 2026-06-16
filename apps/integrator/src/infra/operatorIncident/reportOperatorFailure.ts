import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { sendMaxMessage } from '../../integrations/max/client.js';
import { maxConfig } from '../../integrations/max/config.js';
import { getMaxApiKey } from '../../integrations/max/runtimeConfig.js';
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

function buildDedupKey(direction: string, integration: string, errorClass: string): string {
  return `${direction}:${integration}:${errorClass}`;
}

/** Probe fails: incident only; critical push — после 3-strike в webapp critical tick (SCOPE P7). */
const PROBE_ERROR_CLASSES_NO_IMMEDIATE_CRITICAL = new Set([
  'max_probe_failed',
  'rubitime_get_schedule_failed',
  'telegram_probe_failed',
  'google_calendar_probe_failed',
]);

/**
 * Открыть/обновить операторский инцидент; при первом открытии (occurrence_count === 1) — алерт админам
 * по спискам `admin_telegram_ids` / `admin_max_ids` и `operator_health_alert_config.channels.critical`.
 */
export async function reportOperatorFailure(input: ReportOperatorFailureInput): Promise<void> {
  const dedupKey = buildDedupKey(input.direction, input.integration, input.errorClass);
  const { id: incidentId, occurrenceCount } = await openOrTouchOperatorIncident({
    dedupKey,
    direction: input.direction,
    integration: input.integration,
    errorClass: input.errorClass,
    errorDetail: input.errorDetail ?? null,
  });

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
    lists = await loadAdminMessengerIdLists(db);
  } catch (err) {
    logger.warn({ err }, '[operator_incident] load admin messenger id lists failed');
    return;
  }

  if (channels.telegram && lists.telegram.length > 0) {
    for (const recipientId of lists.telegram) {
      const chatId = Number(recipientId);
      if (!Number.isFinite(chatId)) continue;
      const eventId = `op-alert:${incidentId}:${recipientId}:${dedupKey}`.slice(0, 240);
      const intent: OutgoingIntent = {
        type: 'message.send',
        meta: {
          eventId: `op-inc:${dedupKey}:${recipientId}`.slice(0, 240),
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
      { scope: 'operator_incident', event: 'operator_alert_skipped_no_recipients', channel: 'telegram' },
      'skipped',
    );
  }

  if (channels.max && maxConfig.enabled && lists.max.length > 0) {
    // DEV SAFETY GUARD — this MAX branch calls sendMaxMessage directly, bypassing the integrator
    // dispatchPort dev-redirect (P5). The admin_max_ids recipients are real admin accounts.
    // Suppress in non-production unless explicitly opted in. Prod is a pure passthrough.
    // (Proper fix later: route through dispatchPort → max DeliveryAdapter; guard retired then.)
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_MAX !== '1') {
      logger.warn(
        {
          scope: 'max',
          event: 'dev_max_suppressed',
          channel: 'max',
          recipientCount: lists.max.length,
        },
        '[max] DEV suppress: not sending direct MAX message in non-production (set ALLOW_DEV_MAX=1 to override)',
      );
    } else {
    const apiKey = await getMaxApiKey();
    if (!apiKey.trim()) {
      logger.info(
        { scope: 'operator_incident', event: 'operator_alert_skipped_no_max_api_key', channel: 'max' },
        'skipped',
      );
    } else {
      const config = { apiKey };
      for (const id of lists.max) {
        const userId = Number(id);
        if (!Number.isFinite(userId)) continue;
        try {
          await sendMaxMessage(config, { userId, text });
        } catch (err) {
          logger.warn(
            {
              err,
              scope: 'operator_incident',
              event: 'operator_alert_relay_failed',
              channel: 'max',
              recipient: id,
            },
            'relay failed',
          );
        }
      }
    }
    }
  } else if (channels.max) {
    logger.info(
      { scope: 'operator_incident', event: 'operator_alert_skipped_no_recipients', channel: 'max' },
      'skipped',
    );
  }
}
