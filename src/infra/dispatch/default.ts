import pRetry, { AbortError } from 'p-retry';
import type { DispatchPort, DbWritePort, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { SmsClient } from '../../integrations/smsc/types.js';
import { createMessagingPort } from '../../integrations/telegram/client.js';
import { logger } from '../observability/logger.js';
import { createSmscDispatchPort } from './smsc.js';
import { createTelegramDispatchPort } from './telegram.js';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: { channels?: unknown; maxAttempts?: unknown };
} & Record<string, unknown>;

function readChannels(intent: OutgoingIntent): string[] {
  const payload = intent.payload as DeliveryPayload;
  const channels = payload.delivery?.channels;
  if (Array.isArray(channels)) {
    const normalized = channels.filter((item): item is string => typeof item === 'string');
    if (normalized.length > 0) return normalized;
  }
  return ['smsc'];
}

function readMaxAttempts(intent: OutgoingIntent): number {
  const payload = intent.payload as DeliveryPayload;
  const maxAttempts = payload.delivery?.maxAttempts;
  return typeof maxAttempts === 'number' && maxAttempts > 0 ? Math.floor(maxAttempts) : 3;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isPermanentDispatchError(err: unknown): boolean {
  const errorCode = (err as { error_code?: unknown; code?: unknown })?.error_code
    ?? (err as { error_code?: unknown; code?: unknown })?.code;
  return errorCode === 400 || errorCode === 401 || errorCode === 403 || errorCode === 404;
}

function getErrorCause(err: unknown): unknown {
  return (err as { cause?: unknown })?.cause;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function trim(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function debugDeliveryMessage(input: {
  intent: OutgoingIntent;
  channel: string;
  status: 'attempt_failed' | 'channel_success' | 'channel_failed_fallback';
  attempt: number;
  reason?: string;
  err?: unknown;
}): string {
  const payload = trim(stringify(input.intent.payload), 1200);
  const lines = [
    'DEBUG DELIVERY',
    `status: ${input.status}`,
    `intentType: ${input.intent.type}`,
    `intentEventId: ${input.intent.meta.eventId}`,
    `correlationId: ${input.intent.meta.correlationId ?? '-'}`,
    `channel: ${input.channel}`,
    `attempt: ${input.attempt}`,
    ...(input.reason ? [`reason: ${input.reason}`] : []),
    ...(input.err ? [`error: ${trim(stringify(input.err), 600)}`] : []),
    'payload:',
    payload,
  ];
  return trim(lines.join('\n'), 3500);
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

  async function sendDebugDelivery(input: {
    intent: OutgoingIntent;
    channel: string;
    status: 'attempt_failed' | 'channel_success' | 'channel_failed_fallback';
    attempt: number;
    reason?: string;
    err?: unknown;
  }): Promise<void> {
    if (!deps.debugForwardAllEvents) return;
    if (typeof deps.debugAdminChatId !== 'number' || !Number.isFinite(deps.debugAdminChatId)) return;
    try {
      await getMessagingPort().sendMessage({
        chat_id: deps.debugAdminChatId,
        text: debugDeliveryMessage(input),
      });
    } catch {
      // Debug telemetry should not break delivery pipeline.
    }
  }

  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
      const channels = readChannels(intent);
      const maxAttempts = readMaxAttempts(intent);
      let lastError: unknown = undefined;

      for (const channel of channels) {
        try {
          let attemptCounter = 0;
          await pRetry(
            async () => {
              attemptCounter += 1;
              if (channel === 'telegram') {
                await telegramDispatch.dispatchOutgoing(intent);
                return;
              }
              if (channel === 'smsc') {
                await smscDispatch.dispatchOutgoing(intent);
                return;
              }
              throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
            },
            {
              retries: Math.max(0, maxAttempts - 1),
              onFailedAttempt: async (error) => {
                await logDeliveryAttempt(
                  deps.writePort,
                  intent,
                  channel,
                  'failed',
                  error.attemptNumber,
                  isPermanentDispatchError(getErrorCause(error)) ? 'permanent' : 'transient',
                );
                await sendDebugDelivery({
                  intent,
                  channel,
                  status: 'attempt_failed',
                  attempt: error.attemptNumber,
                  reason: isPermanentDispatchError(getErrorCause(error)) ? 'permanent' : 'transient',
                  err: getErrorCause(error),
                });
              },
            },
          );
          await logDeliveryAttempt(deps.writePort, intent, channel, 'success', attemptCounter);
          await sendDebugDelivery({
            intent,
            channel,
            status: 'channel_success',
            attempt: attemptCounter,
          });
          return;
        } catch (err) {
          lastError = err;
          logger.warn(
            { err, channel, intentEventId: intent.meta.eventId },
            'outgoing dispatch failed, trying next fallback channel',
          );
          await sendDebugDelivery({
            intent,
            channel,
            status: 'channel_failed_fallback',
            attempt: maxAttempts,
            err,
          });
        }
      }

      if (isPermanentDispatchError(lastError)) {
        throw new AbortError(lastError as Error);
      }
      throw (lastError as Error) ?? new Error('DISPATCH_FAILED');
    },
  };
}
