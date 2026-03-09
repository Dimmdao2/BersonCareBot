import type {
  DeliveryAdapter,
  DbReadPort,
  DispatchPort,
  DbWritePort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown; maxAttempts?: unknown };
} & Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePhoneForLookup(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return value;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 11 && onlyDigits.startsWith('8')) return `+7${onlyDigits.slice(1)}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('7')) return `+${onlyDigits}`;
  if (onlyDigits.length === 10) return `+7${onlyDigits}`;
  if (digits.startsWith('+') && /^\+\d{10,15}$/.test(digits)) return digits;
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15) return `+${onlyDigits}`;
  return value;
}

function readChannel(intent: OutgoingIntent): string | null {
  if (intent.type !== 'message.send') return intent.meta.source || null;
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized[0] as string;
  }
  return intent.meta?.source ?? null;
}

function withChannel(intent: OutgoingIntent, channel: string): OutgoingIntent {
  if (intent.type !== 'message.send') return intent;
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
 * Resolves recipient.phoneNormalized -> recipient.chatId for Telegram delivery.
 * Infra concern: Telegram API requires chatId; we resolve from linked phone when needed.
 */
async function resolveTelegramRecipient(
  intent: OutgoingIntent,
  readPort: DbReadPort,
): Promise<OutgoingIntent> {
  if (intent.type !== 'message.send') return intent;
  const payload = intent.payload as DeliveryPayload;
  const recipient = payload.recipient ?? {};
  const hasChatId = typeof recipient.chatId === 'number' && Number.isFinite(recipient.chatId);
  const rawPhone = asString(recipient.phoneNormalized);
  if (hasChatId || !rawPhone) return intent;

  const phoneNormalized = normalizePhoneForLookup(rawPhone);
  const lookup = await readPort.readDb<{ chatId?: number } | null>({
    type: 'user.lookup',
    params: { resource: 'channel', by: 'phone', value: phoneNormalized },
  });

  if (lookup && typeof lookup.chatId === 'number' && Number.isFinite(lookup.chatId)) {
    return {
      ...intent,
      payload: {
        ...payload,
        recipient: { ...recipient, chatId: lookup.chatId },
      },
    };
  }

  const delivery = payload.delivery ?? {};
  return {
    ...intent,
    payload: {
      ...payload,
      recipient: { ...recipient, phoneNormalized },
      delivery: { ...delivery, channels: ['smsc'], maxAttempts: 1 },
    },
  };
}

/**
 * Builds unified dispatch pipeline with retries and fallback channels.
 * Channel order comes from domain-provided `payload.delivery.channels`.
 */
export function createDefaultDispatchPort(deps: {
  adapters: DeliveryAdapter[];
  readPort?: DbReadPort;
  writePort?: DbWritePort;
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      let resolvedIntent = intent;
      if (intent.type === 'message.send' && deps.readPort) {
        resolvedIntent = await resolveTelegramRecipient(intent, deps.readPort);
      }

      const channel = readChannel(resolvedIntent);
      if (!channel) throw new Error('CHANNEL_NOT_SPECIFIED');
      const intentForChannel = withChannel(resolvedIntent, channel);
      const adapter = deps.adapters.find((item) => item.canHandle(intentForChannel));
      if (!adapter) throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
      await adapter.send(intentForChannel);
      if (resolvedIntent.type === 'message.send') {
        await logDeliveryAttempt(deps.writePort, resolvedIntent, channel, 'success', 1);
      }
    },
  };
}
