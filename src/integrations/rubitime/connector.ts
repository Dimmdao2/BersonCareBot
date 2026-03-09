import type { IncomingEvent } from '../../kernel/contracts/index.js';
import type { RubitimeWebhookBodyValidated } from './schema.js';

type RubitimeIncomingPayload = {
  entity: 'record';
  action: 'created' | 'updated' | 'canceled';
  status?: string;
  statusCode?: string;
  recordId?: string;
  phone?: string;
  recordAt?: string;
  record: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeRubitimeAction(event: RubitimeWebhookBodyValidated['event']): RubitimeIncomingPayload['action'] {
  if (event === 'event-create-record') return 'created';
  if (event === 'event-update-record') return 'updated';
  return 'canceled';
}

/** Maps Rubitime status/status_title to script values: accepted, canceled, moved. */
function normalizeRubitimeStatus(status: string | undefined, statusTitle: string | undefined): string | undefined {
  const s = (status ?? '').toLowerCase();
  const t = (statusTitle ?? '').toLowerCase();
  if (s === 'accepted' || s === 'confirmed' || s === 'recorded' || s === '4' ||
      t.includes('записан') || t.includes('подтвержд') || t.includes('принят')) return 'accepted';
  if (s === 'canceled' || s === 'cancelled' || s === '0' ||
      t.includes('отмен')) return 'canceled';
  if (s === 'moved' || t.includes('перенос')) return 'moved';
  return status ?? statusTitle;
}

function toRubitimeIncoming(body: RubitimeWebhookBodyValidated): RubitimeIncomingPayload {
  const data = asRecord(body.data);
  const record = asRecord(data.record);
  const source = Object.keys(record).length > 0 ? record : data;
  const rawStatus = asString(source.status_name) ?? asString(source.status);
  const statusTitle = asString(source.status_title);
  const status = normalizeRubitimeStatus(rawStatus, statusTitle) ?? rawStatus ?? statusTitle;
  const statusCode = asString(source.status);
  const recordId = asString(source.id);
  const phone = asString(source.phone);
  const recordAt = asString(source.datetime);

  return {
    entity: 'record',
    action: normalizeRubitimeAction(body.event),
    ...(status ? { status } : {}),
    ...(statusCode ? { statusCode } : {}),
    ...(recordId ? { recordId } : {}),
    ...(phone ? { phone } : {}),
    ...(recordAt ? { recordAt } : {}),
    record: source,
  };
}

/** Оборачивает валидированный Rubitime webhook в универсальный IncomingEvent. */
export function rubitimeIncomingToEvent(input: {
  body: RubitimeWebhookBodyValidated;
  correlationId: string;
  eventId: string;
}): IncomingEvent {
  const incoming = toRubitimeIncoming(input.body);
  return {
    type: 'webhook.received',
    meta: {
      eventId: input.eventId,
      correlationId: input.correlationId,
      source: 'rubitime',
      occurredAt: new Date().toISOString(),
    },
    payload: {
      incoming,
      body: input.body,
    },
  };
}
