import type { IncomingEvent, Script } from '../contracts/index.js';
import { rubitimeContent } from '../../content/rubitime/content.js';

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type RubitimeTelegramUserContext = {
  chatId: number;
  telegramId: string;
  username: string | null;
};

export type RubitimeRecipientContext = {
  phoneNormalized: string;
  hasTelegramUser: boolean;
  telegramUser: RubitimeTelegramUserContext | null;
  isTelegramAdmin: boolean;
  isAppAdmin: boolean;
  telegramNotificationsEnabled: boolean;
};

type ResolverDeps = {
  resolveRubitimeRecipientContext?: (phoneNormalized: string) => Promise<RubitimeRecipientContext>;
};

/**
 * Выбирает script по входящему событию.
 * Базовая реализация формирует минимальный скрипт с шагом журналирования события
 * и прикладными шагами для Rubitime booking webhook.
 */
export async function resolveScript(event: IncomingEvent, deps: ResolverDeps = {}): Promise<Script> {
  const steps: Script['steps'] = [
    {
      id: `step:log:${event.meta.eventId}`,
      kind: 'event.log',
      mode: 'sync',
      payload: {
        source: event.meta.source,
        eventType: event.type,
        eventId: event.meta.eventId,
        occurredAt: event.meta.occurredAt,
        correlationId: event.meta.correlationId ?? null,
        body: event.payload,
      },
    },
  ];

  if (event.meta.source === 'rubitime' && event.type === 'webhook.received') {
    const payload = readObject(event.payload);
    const body = readObject(payload?.body);
    const data = readObject(body?.data);
    const rubitimeRecordId = readString(data?.id);
    const phoneNormalized = readString(data?.phone);
    const recordAt = readString(data?.record);
    const rawEvent = readString(body?.event) ?? 'event-update-record';
    const status = rawEvent === 'event-create-record'
      ? 'created'
      : rawEvent === 'event-remove-record'
        ? 'canceled'
        : 'updated';

    if (rubitimeRecordId) {
      steps.push({
        id: `step:booking-upsert:${event.meta.eventId}`,
        kind: 'booking.upsert',
        mode: 'sync',
        payload: {
          rubitimeRecordId,
          phoneNormalized,
          recordAt,
          status,
          payloadJson: data ?? {},
          lastEvent: rawEvent,
        },
      });
    }

    if (phoneNormalized) {
      const context = deps.resolveRubitimeRecipientContext
        ? await deps.resolveRubitimeRecipientContext(phoneNormalized)
        : {
          phoneNormalized,
          hasTelegramUser: false,
          telegramUser: null,
          isTelegramAdmin: false,
          isAppAdmin: false,
          telegramNotificationsEnabled: true,
        };
      const canSendTelegram = context.hasTelegramUser
        && context.telegramUser !== null
        && context.telegramNotificationsEnabled;
      const recipient: { phoneNormalized: string; chatId?: number } = { phoneNormalized };
      if (canSendTelegram && context.telegramUser) {
        recipient.chatId = context.telegramUser.chatId;
      }

      steps.push({
        id: `step:message-send:${event.meta.eventId}`,
        kind: 'message.send',
        mode: 'async',
        payload: {
          recipient,
          message: { text: rubitimeContent.messages.bookingUpdateAccepted },
          delivery: {
            channels: canSendTelegram ? ['telegram', 'smsc'] : ['smsc'],
            maxAttempts: 3,
          },
          context,
        },
      });
    }
  }

  return {
    id: `script:${event.meta.source}:${event.type}`,
    steps,
  };
}
