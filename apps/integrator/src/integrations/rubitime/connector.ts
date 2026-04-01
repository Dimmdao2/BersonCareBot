import type { IncomingEvent, WebappEventBody } from '../../kernel/contracts/index.js';
import { syncAppointmentToCalendar, type RubitimeCalendarSyncEvent } from '../google-calendar/sync.js';
import type { RubitimeWebhookBodyValidated } from './schema.js';

type RubitimeIncomingPayload = {
  entity: 'record';
  action: 'created' | 'updated' | 'canceled';
  status?: string;
  statusCode?: string;
  recordId?: string;
  phone?: string;
  recordAt?: string;
  recordAtFormatted?: string;
  /** ISO datetime end of the appointment slot (for compat-sync slotEnd). */
  dateTimeEnd?: string;
  updatedAt?: string;
  record: Record<string, unknown>;
  /** Patient profile from Rubitime card (for scripts and projection). */
  clientName?: string;
  clientEmail?: string;
  clientFirstName?: string;
  clientLastName?: string;
  integratorBranchId?: string;
  branchName?: string;
  /** Rubitime service metadata for compat-sync create path. */
  serviceId?: string;
  serviceName?: string;
  gcalEventId?: string;
};

/** Форматирует дату/время в ДД.ММ.ГГГГ в ЧЧ:ММ. Вход: "2026-03-04 18:00:00" или ISO. */
function formatRecordAt(value: string): string {
  const s = value.trim();
  const spaceIdx = s.indexOf(' ');
  const datePart = spaceIdx >= 0 ? s.slice(0, spaceIdx) : s;
  const timePart = spaceIdx >= 0 ? s.slice(spaceIdx + 1) : '';
  const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const timeStr = timeMatch?.[1] != null && timeMatch?.[2] != null
      ? ` в ${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
      : '';
    return `${d}.${m}.${y}${timeStr}`;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, y, m, d, h, min] = isoMatch;
    return `${d}.${m}.${y} в ${h}:${min}`;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Best-effort split: "Иванов Иван" -> last=Иванов, first=Иван; single word -> first only. */
function parseNameToFirstLast(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] as string };
  return { lastName: parts[0] as string, firstName: parts.slice(1).join(' ') };
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
  const statusTitle = asString(source.status_title) ?? asString(source.status_name);
  const status = normalizeRubitimeStatus(rawStatus, statusTitle);
  const statusCode = asString(source.status) ?? (source.status != null ? String(source.status) : undefined);
  const recordId = asString(source.id) ?? (source.id != null ? String(source.id) : undefined);
  const phone = asString(source.phone);
  const recordAt = asString(source.record) ?? asString(source.datetime);
  const recordAtFormatted = recordAt ? formatRecordAt(recordAt) : undefined;
  const updatedAt = asString(source.updated_at);
  const clientName = asString(source.name);
  const clientEmail = asString(source.email);
  const integratorBranchId =
    asString(source.branch_id) ?? (source.branch_id != null ? String(source.branch_id) : undefined);
  const branchName = asString(source.branch_name) ?? asString(source.branch_title);
  // Stage 11: enrich with service metadata for compat-sync create path.
  const serviceId =
    asString(source.service_id) ?? (source.service_id != null ? String(source.service_id) : undefined);
  const serviceName = asString(source.service_name) ?? asString(source.service_title);
  const dateTimeEnd = asString(source.datetime_end) ?? asString(source.date_time_end);
  const { firstName: clientFirstName, lastName: clientLastName } = clientName
    ? parseNameToFirstLast(clientName)
    : {};

  return {
    entity: 'record',
    action: normalizeRubitimeAction(body.event),
    ...(status ? { status } : {}),
    ...(statusCode ? { statusCode } : {}),
    ...(recordId ? { recordId } : {}),
    ...(phone ? { phone } : {}),
    ...(recordAt ? { recordAt } : {}),
    ...(recordAtFormatted ? { recordAtFormatted } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    record: source,
    ...(clientName ? { clientName } : {}),
    ...(clientEmail ? { clientEmail } : {}),
    ...(clientFirstName ? { clientFirstName } : {}),
    ...(clientLastName ? { clientLastName } : {}),
    ...(integratorBranchId ? { integratorBranchId } : {}),
    ...(branchName ? { branchName } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(serviceName ? { serviceName } : {}),
    ...(dateTimeEnd ? { dateTimeEnd } : {}),
  };
}

function buildRubitimeDedupFingerprint(incoming: RubitimeIncomingPayload): Record<string, string | number | boolean | null> {
  return {
    entity: incoming.entity,
    action: incoming.action,
    recordId: incoming.recordId ?? null,
    status: incoming.status ?? null,
    recordAt: incoming.recordAt ?? null,
    updatedAt: incoming.updatedAt ?? null,
  };
}

/** Событие для webapp: автопривязка email из Rubitime (только event-create-record, см. USER_TODO_STAGE). */
export function buildUserEmailAutobindWebappEvent(body: RubitimeWebhookBodyValidated): WebappEventBody | null {
  if (body.event !== 'event-create-record') return null;
  const inc = toRubitimeIncoming(body);
  const email = inc.clientEmail?.trim();
  const phone = inc.phone?.trim();
  if (!email || !phone) return null;
  const rid = inc.recordId?.trim() ?? '';
  const idem = `rubitime:email-autobind:${rid || phone}:${email}`;
  return {
    eventType: 'user.email.autobind',
    idempotencyKey: idem.slice(0, 240),
    payload: { phoneNormalized: phone, email },
  };
}

/**
 * Google Calendar projection: вызывается из Rubitime ingress (webhook) один раз на обработанное тело.
 * Слой sync по EXEC — connector, не дублировать вызов из других мест на тот же webhook.
 */
export async function syncRubitimeWebhookBodyToGoogleCalendar(
  body: RubitimeWebhookBodyValidated,
): Promise<string | null> {
  const incoming = toRubitimeIncoming(body);
  if (
    incoming.action !== 'created'
    && incoming.action !== 'updated'
    && incoming.action !== 'canceled'
  ) {
    return null;
  }
  const recordId = incoming.recordId;
  if (typeof recordId !== 'string' || recordId.trim().length === 0) {
    return null;
  }
  const syncPayload: RubitimeCalendarSyncEvent = {
    action: incoming.action,
    rubRecordId: recordId.trim(),
  };
  if (incoming.recordAt !== undefined) syncPayload.recordAt = incoming.recordAt;
  if (incoming.record !== undefined) syncPayload.record = incoming.record;
  if (incoming.clientName !== undefined) syncPayload.clientName = incoming.clientName;
  return syncAppointmentToCalendar(syncPayload);
}

/** Оборачивает валидированный Rubitime webhook в универсальный IncomingEvent. */
export function rubitimeIncomingToEvent(input: {
  body: RubitimeWebhookBodyValidated;
  correlationId: string;
  eventId: string;
  gcalEventId?: string | null;
}): IncomingEvent {
  const incoming = toRubitimeIncoming(input.body);
  if (typeof input.gcalEventId === 'string' && input.gcalEventId.trim().length > 0) {
    incoming.gcalEventId = input.gcalEventId.trim();
  }
  return {
    type: 'webhook.received',
    meta: {
      eventId: input.eventId,
      correlationId: input.correlationId,
      source: 'rubitime',
      occurredAt: new Date().toISOString(),
      dedupFingerprint: buildRubitimeDedupFingerprint(incoming),
    },
    payload: {
      incoming,
      body: input.body,
    },
  };
}
