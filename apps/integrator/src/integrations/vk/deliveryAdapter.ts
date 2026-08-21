import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent } from '../../kernel/contracts/index.js';
import { readChannel } from '../../infra/adapters/channelRouting.js';
import { getVkRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';
import { RecipientBlockedBotError } from '../../infra/delivery/recipientBotBlocked.js';
import { answerVkMessageEvent, sendVkMessage, VkApiError, type VkFetch } from './client.js';

type Payload = {
  recipient?: { chatId?: unknown; userId?: unknown };
  message?: { text?: unknown };
  callbackQueryId?: unknown;
  notification?: unknown;
  delivery?: { clinicCredential?: { channel?: unknown; accessToken?: unknown } };
} & Record<string, unknown>;
function asPositiveInt(value: unknown): number | null { const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isSafeInteger(n) && n > 0 ? n : null; }
function nonEmpty(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function callbackFields(value: unknown): { eventId: string; userId: number; peerId: number } | null { const raw = nonEmpty(value); if (!raw) return null; const [eventId, user, peer, ...rest] = raw.split(':'); const userId = asPositiveInt(user); const peerId = asPositiveInt(peer); return eventId && userId && peerId && rest.length === 0 ? { eventId, userId, peerId } : null; }

export function createVkDeliveryAdapter(input: { fetchImpl?: VkFetch } = {}): DeliveryAdapter {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    canHandle(intent: OutgoingIntent): boolean { return (intent.type === 'message.send' && readChannel(intent) === 'vk') || (intent.type === 'callback.answer' && intent.meta.source === 'vk'); },
    async send(intent: OutgoingIntent): Promise<DeliverySendResult> {
      const payload = intent.payload as Payload;
      const clinicToken = nonEmpty(
        payload.delivery?.clinicCredential?.channel === 'vk'
          ? payload.delivery.clinicCredential.accessToken
          : undefined,
      );
      const config = await getVkRuntimeConfig();
      if (!clinicToken && !config.enabled) throw new Error('VK_RUNTIME_CONFIG_UNAVAILABLE');
      const accessToken = clinicToken ?? config.communityAccessToken;
      try {
        if (intent.type === 'message.send') {
          const userId = asPositiveInt(payload.recipient?.userId ?? payload.recipient?.chatId); const text = nonEmpty(payload.message?.text);
          if (!userId || !text) throw new Error('VK_PAYLOAD_INVALID: recipient and message.text required');
          const messageId = await sendVkMessage({ accessToken }, { userId, text, eventId: intent.meta.eventId }, fetchImpl);
          return { vkMessageId: String(messageId) };
        }
        const callback = callbackFields(payload.callbackQueryId); if (!callback) throw new Error('VK_PAYLOAD_INVALID: callbackQueryId required');
        await answerVkMessageEvent({ accessToken }, { ...callback, eventData: JSON.stringify({ type: 'show_snackbar', text: nonEmpty(payload.notification) ?? '' }) }, fetchImpl);
        return {};
      } catch (error) {
        if (error instanceof VkApiError && [900, 901, 902, 917, 945, 1021].includes(error.code ?? -1)) throw new RecipientBlockedBotError('vk', error.apiMessage);
        throw error;
      }
    },
  };
}
