/** Канонический набор примитивов для дедупликации нормализованного события. */
export type DedupFingerprint = Record<string, string | number | boolean | null>;

/** Метаданные события, общие для входящих и исходящих конвертов. */
export type EventMeta = {
  eventId: string;
  occurredAt: string;
  source: string;
  correlationId?: string;
  userId?: string;
  dedupFingerprint?: DedupFingerprint;
};

/** Семантический алиас для метаданных исходящего намерения. */
export type IntentMeta = EventMeta;

/** Поддерживаемые типы входящих событий в универсальном pipeline. */
export type IncomingEventType =
  | 'message.received'
  | 'callback.received'
  | 'webhook.received'
  | 'schedule.tick'
  | 'admin.command';

/** Поддерживаемые типы исходящих намерений домена/оркестратора. */
export type OutgoingIntentType =
  | 'message.send'
  | 'message.copy'
  | 'message.edit'
  | 'message.replyMarkup.edit'
  | 'message.delete'
  | 'callback.answer'
  | 'booking.changed'
  | 'integration.sync'
  | 'audit.log';

/** Совместимый алиас прежнего имени типа исходящего события. */
export type OutgoingEventType = OutgoingIntentType;

/** Нормализованный входящий event-конверт. */
export type IncomingEvent = {
  type: IncomingEventType;
  meta: EventMeta;
  payload: Record<string, unknown>;
};

/** Нормализованное исходящее намерение на dispatch. */
export type OutgoingIntent = {
  type: OutgoingIntentType;
  meta: IntentMeta;
  payload: Record<string, unknown>;
};

/** Совместимый алиас прежнего имени исходящего события. */
export type OutgoingEvent = OutgoingIntent;
