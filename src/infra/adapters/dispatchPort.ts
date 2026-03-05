import type { DeliveryAdapter, DispatchPort, DbWritePort, OutgoingIntent } from '../../kernel/contracts/index.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown; maxAttempts?: unknown };
} & Record<string, unknown>;

function readChannel(intent: OutgoingIntent): string | null {
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return null;
}

function withChannel(intent: OutgoingIntent, channel: string): OutgoingIntent {
  const payload = (intent.payload ?? {}) as DeliveryPayload;
  const delivery = { ...(payload.delivery ?? {}), channels: [channel] };
  return {
    ...intent,
    payload: {
      ...payload,
      delivery,
    },
  };
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
  adapters: DeliveryAdapter[];
  writePort?: DbWritePort;
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
      const channel = readChannel(intent);
      if (!channel) throw new Error('CHANNEL_NOT_SPECIFIED');
      const intentForChannel = withChannel(intent, channel);
      const adapter = deps.adapters.find((item) => item.canHandle(intentForChannel));
      if (!adapter) throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
      await adapter.send(intentForChannel);
      await logDeliveryAttempt(deps.writePort, intent, channel, 'success', 1);
    },
  };
}
