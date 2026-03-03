export type EventMeta = {
  eventId: string;
  occurredAt: string;
  source: string;
  correlationId?: string;
  userId?: string;
};

export type IncomingEventType =
  | 'message.received'
  | 'callback.received'
  | 'webhook.received'
  | 'schedule.tick'
  | 'admin.command';

export type OutgoingEventType =
  | 'message.send'
  | 'booking.changed'
  | 'integration.sync'
  | 'audit.log';

export type IncomingEvent = {
  type: IncomingEventType;
  meta: EventMeta;
  payload: Record<string, unknown>;
};

export type OutgoingEvent = {
  type: OutgoingEventType;
  meta: EventMeta;
  payload: Record<string, unknown>;
};
