import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createMessagingPort } from './client.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown };
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

export function createTelegramDeliveryAdapter(): DeliveryAdapter {
  let messagingPort: ReturnType<typeof createMessagingPort> | null = null;
  const getMessagingPort = (): ReturnType<typeof createMessagingPort> => {
    if (!messagingPort) messagingPort = createMessagingPort();
    return messagingPort;
  };

  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type !== 'message.send') return false;
      return readChannel(intent) === 'telegram';
    },
    async send(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
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
  };
}
