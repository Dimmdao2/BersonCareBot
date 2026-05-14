import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { telegramConfig } from '../../integrations/telegram/config.js';
import {
  markOperatorIncidentAlertSent,
  openOrTouchOperatorIncident,
} from '../db/repos/operatorHealthDrizzle.js';

export type ReportOperatorFailureInput = {
  /** When omitted, incident is still recorded; Telegram alert is skipped. */
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
 * Открыть/обновить операторский инцидент; при первом открытии (occurrence_count === 1) — один Telegram админу.
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

  const dispatchPort = input.dispatchPort;
  if (!dispatchPort) return;

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
  try {
    await dispatchPort.dispatchOutgoing(intent);
    await markOperatorIncidentAlertSent(id);
  } catch {
    // best-effort alert; alert_sent_at stays null — повторный dedup может не ретраить TG в MVP
  }
}
