import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { telegramConfig } from '../../integrations/telegram/config.js';
import {
  openOrTouchOperatorIncident,
} from '../db/repos/operatorHealthDrizzle.js';
import { createDbPort } from '../db/client.js';
import { enqueueOutgoingDeliveryIfAbsent } from '../db/repos/outgoingDeliveryQueue.js';
import { OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS } from '../delivery/deliveryContract.js';

export type ReportOperatorFailureInput = {
  /** @deprecated Оставлено для совместимости вызовов; доставка идёт через `outgoing_delivery_queue`. */
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

/**
 * Открыть/обновить операторский инцидент; при первом открытии (occurrence_count === 1) — поставить TG-алерт в очередь доставки.
 */
export async function reportOperatorFailure(input: ReportOperatorFailureInput): Promise<void> {
  const dedupKey = buildDedupKey(input.direction, input.integration, input.errorClass);
  const { id, occurrenceCount } = await openOrTouchOperatorIncident({
    dedupKey,
    direction: input.direction,
    integration: input.integration,
    errorClass: input.errorClass,
    errorDetail: input.errorDetail ?? null,
  });

  if (occurrenceCount !== 1) return;

  const adminId = telegramConfig.adminTelegramId;
  if (typeof adminId !== 'number' || !Number.isFinite(adminId)) return;

  const text = input.alertLines.join('\n');
  const intent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `op-inc:${dedupKey}`.slice(0, 240),
      occurredAt: new Date().toISOString(),
      source: 'telegram',
    },
    payload: {
      recipient: { chatId: adminId },
      message: { text },
      delivery: { channels: ['telegram'], maxAttempts: 1 },
    },
  };

  const db = createDbPort();
  const eventId = `op-alert:${id}`.slice(0, 240);
  await enqueueOutgoingDeliveryIfAbsent(db, {
    eventId,
    kind: 'operator_alert',
    channel: 'telegram',
    payloadJson: { incidentId: id, intent },
    maxAttempts: OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS,
  });
}
