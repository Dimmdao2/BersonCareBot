import type { IncomingEvent, OutgoingEvent } from '../../kernel/contracts/index.js';
import type { IncomingUpdate, OutgoingAction } from '../../kernel/domain/types.js';
import { randomUUID } from 'node:crypto';
import { toTelegram, type TelegramApi } from './mapOut.js';

type TelegramIncomingPayload = {
  incoming: IncomingUpdate;
};

type TelegramOutgoingPayload = {
  action: OutgoingAction;
};

/** Оборачивает входящее Telegram-обновление в универсальный IncomingEvent. */
export function telegramIncomingToEvent(input: {
  incoming: IncomingUpdate;
  correlationId: string;
  eventId: string;
  updateId?: number;
  facts?: Record<string, unknown>;
}): IncomingEvent {
  const dedupKey =
    typeof input.updateId === 'number' ? `telegram:${input.updateId}` : undefined;
  return {
    type: input.incoming.kind === 'callback' ? 'callback.received' : 'message.received',
    meta: {
      eventId: input.eventId,
      correlationId: input.correlationId,
      source: 'telegram',
      occurredAt: new Date().toISOString(),
      ...(dedupKey ? { dedupKey } : {}),
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

/** Извлекает Telegram payload из универсального IncomingEvent. */
export function telegramEventToIncoming(event: IncomingEvent): IncomingUpdate | null {
  if (event.meta.source !== 'telegram') return null;
  const payload = event.payload as unknown as TelegramIncomingPayload;
  if (!payload?.incoming || typeof payload.incoming !== 'object') return null;
  return payload.incoming;
}

/** Преобразует Telegram actions в список универсальных OutgoingEvent. */
export function telegramActionsToOutgoingEvents(input: {
  actions: OutgoingAction[];
  correlationId: string;
}): OutgoingEvent[] {
  return input.actions.map((action) => ({
    type: 'message.send',
    meta: {
      eventId: `out_${randomUUID()}`,
      correlationId: input.correlationId,
      source: 'telegram',
      occurredAt: new Date().toISOString(),
    },
    payload: { action },
  }));
}

/** Отправляет отфильтрованные telegram-события через Telegram API. */
export async function dispatchTelegramOutgoingEvents(events: OutgoingEvent[], api: TelegramApi): Promise<void> {
  const actions: OutgoingAction[] = [];
  for (const event of events) {
    if (event.type !== 'message.send' || event.meta.source !== 'telegram') continue;
    const payload = event.payload as unknown as TelegramOutgoingPayload;
    if (!payload?.action || typeof payload.action !== 'object') continue;
    actions.push(payload.action);
  }
  if (actions.length > 0) {
    await toTelegram(actions, api);
  }
}
