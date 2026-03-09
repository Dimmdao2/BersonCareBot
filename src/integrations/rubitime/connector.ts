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
  if (event === 'event-delete-record' || event === 'event-remove-record') return 'canceled';
  return 'canceled';
}

/**
 * Maps Rubitime status to script values.
 * 0 = Записан (recorded) — успешная запись
 * 1, 2, 3 — ничего не делаем
 * 4 = Отменена (canceled)
 * Ожидает подтверждения — awaiting_confirmation
 * Перенос записи — moved_awaiting
 */
function normalizeRubitimeStatus(status: string | undefined, statusTitle: string | undefined): string | undefined {
  const s = (status ?? '').toString().toLowerCase();
  const t = (statusTitle ?? '').toLowerCase();
  if (s === '0' || t.includes('записан') || s === 'accepted' || s === 'confirmed') return 'recorded';
  if (s === '4' || t.includes('отмен') || s === 'canceled' || s === 'cancelled') return 'canceled';
  if (t.includes('ожида') && t.includes('подтвержд')) return 'awaiting_confirmation';
  if (t.includes('перенос') || s === 'moved') return 'moved_awaiting';
  if (s === '1' || s === '2' || s === '3') return undefined;
  return undefined;
}

function toRubitimeIncoming(body: RubitimeWebhookBodyValidated): RubitimeIncomingPayload {
  const data = asRecord(body.data);
  const record = asRecord(data.record);
  const source = Object.keys(record).length > 0 ? record : data;
  const rawStatus = asString(source.status) ?? (source.status != null ? String(source.status) : undefined);
  const statusTitle = asString(source.status_title);
  const status = normalizeRubitimeStatus(rawStatus, statusTitle);
  const statusCode = asString(source.status) ?? (source.status != null ? String(source.status) : undefined);
  const recordId = asString(source.id) ?? (source.id != null ? String(source.id) : undefined);
  const phone = asString(source.phone);
  const recordAt = asString(source.record) ?? asString(source.datetime);

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
