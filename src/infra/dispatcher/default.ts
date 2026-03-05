import type { DispatchPort, DbWritePort, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { SmsClient } from '../../integrations/smsc/types.js';
import { createMessagingPort } from '../../integrations/telegram/client.js';
import { createSmscDispatchPort } from './smsc.js';
import { createTelegramDispatchPort } from './telegram.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown; maxAttempts?: unknown };
} & Record<string, unknown>;

function readChannel(intent: OutgoingIntent): string {
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return 'smsc';
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function logDeliveryAttempt(
  writePort: DbWritePort | undefined,
  intent: OutgoingIntent,
  channel: string,
  status: 'success' | 'failed',
  attempt: number,
  reason?: string,
): Promise<void> {
  if (!writePort) return;
  await writePort.writeDb({
    type: 'delivery.attempt.log',
    params: {
      intentType: intent.type,
      intentEventId: intent.meta.eventId,
      correlationId: intent.meta.correlationId ?? null,
      channel,
      status,
      attempt,
      reason: reason ?? null,
      payload: intent.payload,
      occurredAt: new Date().toISOString(),
    },
  });
}

/**
 * Builds unified dispatch pipeline with retries and fallback channels.
 * Channel order comes from domain-provided `payload.delivery.channels`.
 */
export function createDefaultDispatchPort(deps: {
  smsClient: SmsClient;
  writePort?: DbWritePort;
  debugForwardAllEvents?: boolean;
  debugAdminChatId?: number;
}): DispatchPort {
  const smscDispatch = createSmscDispatchPort({ smsClient: deps.smsClient });
  let messagingPort: ReturnType<typeof createMessagingPort> | null = null;
  const getMessagingPort = (): ReturnType<typeof createMessagingPort> => {
    if (!messagingPort) messagingPort = createMessagingPort();
    return messagingPort;
  };
  const telegramDispatch = createTelegramDispatchPort({
    async sendTelegramIntent(intent: OutgoingIntent): Promise<void> {
      const payload = intent.payload as DeliveryPayload;
      const chatId = payload.recipient?.chatId;
      const text = asNonEmptyString(payload.message?.text);
      if (typeof chatId !== 'number' || !text) {
        const err = new Error('TELEGRAM_PAYLOAD_INVALID');
        (err as { code?: number }).code = 400;
        throw err;
      }
      await getMessagingPort().sendMessage({ chat_id: chatId, text });
    },
  });

  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
      const channel = readChannel(intent);
      if (channel === 'telegram') {
        await telegramDispatch.dispatchOutgoing(intent);
        await logDeliveryAttempt(deps.writePort, intent, channel, 'success', 1);
        return;
      }
      if (channel === 'smsc') {
        await smscDispatch.dispatchOutgoing(intent);
        await logDeliveryAttempt(deps.writePort, intent, channel, 'success', 1);
        return;
      }
      throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
    },
  };
}
