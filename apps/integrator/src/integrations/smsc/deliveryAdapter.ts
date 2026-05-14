import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { SmsClient } from './types.js';

type DeliveryPayload = {
  recipient?: { phoneNormalized?: string };
  message?: { text?: string };
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

export function createSmscDeliveryAdapter(deps: { smsClient: SmsClient }): DeliveryAdapter {
  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type !== 'message.send') return false;
      return readChannel(intent) === 'smsc';
    },
    async send(intent: OutgoingIntent): Promise<DeliverySendResult> {
      if (intent.type !== 'message.send') return {};
      const payload = intent.payload as DeliveryPayload;
      const toPhone = payload.recipient?.phoneNormalized ?? '';
      const message = payload.message?.text ?? '';
      if (!toPhone || !message) return {};
      await deps.smsClient.sendSms({ toPhone, message });
      return {};
    },
  };
}
