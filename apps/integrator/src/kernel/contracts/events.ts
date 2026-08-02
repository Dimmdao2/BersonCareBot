/** Канонический набор примитивов для дедупликации нормализованного события. */
export type DedupFingerprint = Record<string, string | number | boolean | null>;

/** Finite policy classes for external outgoing delivery. */
export const OUTBOUND_MESSAGE_CLASSES = [
  'auth_code',
  'routine_product',
  'conversation_event',
  'broadcast_event',
  'account_service',
  'operator_security',
] as const;

export type OutboundMessageClass = (typeof OUTBOUND_MESSAGE_CLASSES)[number];

/** Capability is deliberately paired with class; it is not caller-controlled relay metadata. */
export const OUTBOUND_MESSAGE_CAPABILITIES = [
  'auth_code',
  'contact_handshake',
  'app_push',
  'essential_delivery',
  'clinic_delivery',
  'operator_alert',
] as const;

export type OutboundMessageCapability = (typeof OUTBOUND_MESSAGE_CAPABILITIES)[number];

/**
 * Optional while legacy intent JSON is still readable. The dispatch policy treats a missing,
 * malformed, or incompatible marker as an external-delivery denial.
 */
export type OutboundMessagePolicyMeta = {
  outboundMessageClass?: OutboundMessageClass;
  outboundCapability?: OutboundMessageCapability;
};

/** Метаданные события, общие для входящих и исходящих конвертов. */
export type EventMeta = OutboundMessagePolicyMeta & {
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
