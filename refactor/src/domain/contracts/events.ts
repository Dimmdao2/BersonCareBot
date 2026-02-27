/** Метаданные события, общие для входящих и исходящих конвертов. */
export type EventMeta = {
  eventId: string;
  occurredAt: string;
  source: string;
  correlationId?: string;
  userId?: string;
};

/** Поддерживаемые типы входящих событий в универсальном pipeline. */
export type IncomingEventType =
  | 'message.received'
  | 'callback.received'
  | 'webhook.received'
  | 'schedule.tick'
  | 'admin.command';

/** Поддерживаемые типы исходящих событий в универсальном pipeline. */
export type OutgoingEventType =
  | 'message.send'
  | 'booking.changed'
  | 'integration.sync'
  | 'audit.log';

/** Нормализованный входящий event-конверт. */
export type IncomingEvent = {
  type: IncomingEventType;
  meta: EventMeta;
  payload: Record<string, unknown>;
};

/** Нормализованный исходящий event-конверт. */
export type OutgoingEvent = {
  type: OutgoingEventType;
  meta: EventMeta;
  payload: Record<string, unknown>;
};
