import type { IncomingEvent } from '../../domain/contracts/index.js';
import type { RubitimeWebhookBodyValidated } from './schema.js';

/** Оборачивает валидированный Rubitime webhook в универсальный IncomingEvent. */
export function rubitimeIncomingToEvent(input: {
  body: RubitimeWebhookBodyValidated;
  correlationId: string;
  eventId: string;
}): IncomingEvent {
  return {
    type: 'webhook.received',
    meta: {
      eventId: input.eventId,
      correlationId: input.correlationId,
      source: 'rubitime',
      occurredAt: new Date().toISOString(),
    },
    payload: {
      body: input.body,
    },
  };
}
