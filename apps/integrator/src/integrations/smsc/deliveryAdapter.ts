import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { SmsClient } from './types.js';
import { readChannelWithDefault } from '../../infra/adapters/channelRouting.js';

type DeliveryPayload = {
  recipient?: { phoneNormalized?: string };
  message?: { text?: string };
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

export function createSmscDeliveryAdapter(deps: { smsClient: SmsClient }): DeliveryAdapter {
  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type !== 'message.send') return false;
      // Falls back to 'smsc' (the original adapter default, D4 — preserved exactly).
      return readChannelWithDefault(intent, 'smsc') === 'smsc';
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
