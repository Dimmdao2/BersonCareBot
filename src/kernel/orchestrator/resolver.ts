import type { IncomingEvent, Script } from '../contracts/index.js';
import { rubitimeContent } from '../../content/rubitime/content.js';

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Выбирает script по входящему событию.
 * Базовая реализация формирует минимальный скрипт с шагом журналирования события
 * и прикладными шагами для Rubitime booking webhook.
 */
export function resolveScript(event: IncomingEvent): Script {
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
      steps.push({
        id: `step:message-send:${event.meta.eventId}`,
        kind: 'message.send',
        mode: 'async',
        payload: {
          recipient: { phoneNormalized },
          message: { text: rubitimeContent.messages.bookingUpdateAccepted },
        },
      });
    }
  }

  return {
    id: `script:${event.meta.source}:${event.type}`,
    steps,
  };
}
