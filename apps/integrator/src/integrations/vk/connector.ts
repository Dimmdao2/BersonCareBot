import type { IncomingEvent } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';

export function vkIncomingToEvent(input: { incoming: IncomingUpdate; correlationId: string; eventId: string; providerEventId?: string }): IncomingEvent {
  const dedupFingerprint = input.incoming.kind === 'callback' ? { callbackId: input.incoming.callbackQueryId } : input.providerEventId ? { eventId: input.providerEventId } : input.incoming.messageId !== undefined ? { messageId: String(input.incoming.messageId) } : undefined;
  return { type: input.incoming.kind === 'callback' ? 'callback.received' : 'message.received', meta: { eventId: input.eventId, correlationId: input.correlationId, source: 'vk', occurredAt: new Date().toISOString(), ...(dedupFingerprint ? { dedupFingerprint } : {}), userId: input.incoming.kind === 'message' ? input.incoming.channelId : String(input.incoming.channelUserId) }, payload: { incoming: input.incoming as unknown } };
}
