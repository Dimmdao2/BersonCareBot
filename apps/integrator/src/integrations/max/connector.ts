import type { IncomingEvent } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';

type MaxIncomingPayload = {
  incoming: IncomingUpdate;
};

/**
 * Wraps normalized MAX incoming update into universal IncomingEvent.
 */
export function maxIncomingToEvent(input: {
  incoming: IncomingUpdate;
  correlationId: string;
  eventId: string;
  updateId?: number;
  facts?: Record<string, unknown>;
}): IncomingEvent {
  const dedupFingerprint =
    input.incoming.kind === 'callback' && input.incoming.callbackQueryId
      ? { callbackId: input.incoming.callbackQueryId }
      : (typeof input.updateId === 'number' ? { updateId: input.updateId } : undefined);
  return {
    type: input.incoming.kind === 'callback' ? 'callback.received' : 'message.received',
    meta: {
      eventId: input.eventId,
      correlationId: input.correlationId,
      source: 'max',
      occurredAt: new Date().toISOString(),
      ...(dedupFingerprint ? { dedupFingerprint } : {}),
      ...(input.incoming.kind === 'message'
        ? { userId: input.incoming.channelId }
        : { userId: String(input.incoming.channelUserId) }),
    },
    payload: {
      incoming: input.incoming as unknown,
      ...(input.facts ? { facts: input.facts } : {}),
      ...(typeof input.updateId === 'number' ? { updateId: input.updateId } : {}),
    },
  };
}

/** Extract MAX incoming payload from universal IncomingEvent. */
export function maxEventToIncoming(event: IncomingEvent): IncomingUpdate | null {
  if (event.meta.source !== 'max') return null;
  const payload = event.payload as unknown as MaxIncomingPayload;
  if (!payload?.incoming || typeof payload.incoming !== 'object') return null;
  return payload.incoming;
}
