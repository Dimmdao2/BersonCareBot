import type { IncomingEvent, Script } from '../contracts/index.js';
import { rubitimeBookingStatuses, rubitimeContent } from '../../content/rubitime/content.js';

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStatusCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function mapRubitimeStatusForStorage(rawStatusCode: number | null, rawEvent: string): 'created' | 'updated' | 'canceled' {
  if (rawEvent === 'event-remove-record') return 'canceled';
  if (rawEvent === 'event-create-record') return 'created';
  if (rawStatusCode === rubitimeBookingStatuses.canceled) return 'canceled';
  return 'updated';
}

function buildRubitimeMessageByStatus(input: {
  rawEvent: string;
  statusCode: number | null;
  recordAt: string | null;
  comment: string | null;
}): string | null {
  if (input.rawEvent === 'event-remove-record') {
    return rubitimeContent.messages.bookingCanceled({ recordAt: input.recordAt });
  }
  if (input.rawEvent === 'event-create-record') {
    return rubitimeContent.messages.bookingAccepted({ recordAt: input.recordAt });
  }
  if (input.rawEvent !== 'event-update-record') return null;
  if (input.statusCode === rubitimeBookingStatuses.accepted) {
    return rubitimeContent.messages.bookingAccepted({ recordAt: input.recordAt });
  }
  if (input.statusCode === rubitimeBookingStatuses.canceled) {
    return rubitimeContent.messages.bookingCanceled({ recordAt: input.recordAt });
  }
  if (input.statusCode === rubitimeBookingStatuses.moved) {
    return rubitimeContent.messages.bookingMoved({ comment: input.comment });
  }
  return null;
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
    const comment = readString(data?.comment);
    const statusCode = readStatusCode(data?.status);
    const rawEvent = readString(body?.event) ?? 'event-update-record';
    const status = mapRubitimeStatusForStorage(statusCode, rawEvent);
    const messageText = buildRubitimeMessageByStatus({ rawEvent, statusCode, recordAt, comment });

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
          rubitimeStatusCode: statusCode,
          payloadJson: data ?? {},
          lastEvent: rawEvent,
        },
      });
    }

    if (phoneNormalized && messageText) {
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
          message: { text: messageText },
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
