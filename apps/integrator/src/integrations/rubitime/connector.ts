import type { DbPort, DispatchPort, IncomingEvent, WebappEventBody } from '../../kernel/contracts/index.js';
import type { NormalizeToUtcInstantFailureReason } from '../../shared/normalizeToUtcInstant.js';
import { syncAppointmentToCalendar, type RubitimeCalendarSyncEvent } from '../google-calendar/sync.js';
import type { RubitimeWebhookBodyValidated } from './schema.js';
import { normalizeRuPhoneE164 } from '../../infra/phone/normalizeRuPhoneE164.js';

export type RubitimeIncomingPayload = {
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
  /** Specialist / cooperator id in Rubitime (for catalog lookup disambiguation). */
  cooperatorId?: string;
  gcalEventId?: string;
  /** Set after ingest timezone normalization (Stage 3). */
  timeNormalizationStatus?: "ok" | "degraded";
  timeNormalizationFieldErrors?: Array<{
    field: "recordAt" | "dateTimeEnd";
    reason: NormalizeToUtcInstantFailureReason;
  }>;
};

/** Форматирует дату/время в ДД.ММ.ГГГГ в ЧЧ:ММ. Вход: "2026-03-04 18:00:00" или ISO. */
export function formatRubitimeRecordAtForDisplay(value: string): string {
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

/**
 * Вебхук Rubitime может дублировать часть полей на верхнем уровне `data` и во вложенном `data.record`.
 * Для календаря и проекции нужны комментарии: подмешиваем из родителя, если во вложенной записи пусто.
 * @see https://rubitime.ru/faq/api — `comment` (клиент); внутренние поля админа зависят от версии API.
 */
const RUBITIME_WEBHOOK_SIBLING_COMMENT_KEYS = [
  'comment',
  'admin_comment',
  'comment_admin',
  'staff_comment',
  'internal_comment',
  'admin_note',
] as const;

function mergeRubitimeWebhookSiblingCommentFields(
  source: Record<string, unknown>,
  dataRoot: Record<string, unknown>,
): Record<string, unknown> {
  if (source === dataRoot) return source;
  let out: Record<string, unknown> = { ...source };
  for (const k of RUBITIME_WEBHOOK_SIBLING_COMMENT_KEYS) {
    if (asString(out[k])) continue;
    const fromParent = asString(dataRoot[k]);
    if (fromParent) {
      out = { ...out, [k]: dataRoot[k] };
    }
  }
  return out;
}

/**
 * Split name into first/last only when unambiguous (exactly 2 words).
 * With 3+ words (e.g. Russian ФИО with patronymic, or swapped order)
 * we cannot reliably distinguish first/last, so we skip the split.
 */
function parseNameToFirstLast(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] as string };
  if (parts.length === 2) return { lastName: parts[0] as string, firstName: parts[1] as string };
  return {};
}

function normalizeRubitimeAction(event: RubitimeWebhookBodyValidated['event']): RubitimeIncomingPayload['action'] {
  if (event === 'event-create-record') return 'created';
  if (event === 'event-update-record') return 'updated';
  if (event === 'event-delete-record' || event === 'event-remove-record') return 'canceled';
  return 'canceled';
}

/**
 * Maps Rubitime numeric status code to internal script values.
 *
 * Rubitime API spec:
 *   0 = Записан            -> recorded
 *   1 = На обслуживании    -> in_service   (no notifications, stored for audit)
 *   2 = Завершен           -> completed    (no notifications, stored for audit)
 *   3 = Ожидание предоплаты -> awaiting_prepayment (no notifications, stored for audit)
 *   4 = Отменен            -> canceled
 *   5 = Ожидает подтверждения -> awaiting_confirmation
 *   6 = Добавлено в корзину -> in_cart      (no notifications, stored for audit)
 *   7 = Перенос записи     -> moved_awaiting
 *
 * Fallback: text-based matching on status_title for legacy/non-numeric codes.
 */
function normalizeRubitimeStatus(status: string | undefined, statusTitle: string | undefined): string | undefined {
  const s = (status ?? '').toString().toLowerCase().trim();
  const t = (statusTitle ?? '').toLowerCase();

  if (s === '0' || s === 'accepted' || s === 'confirmed') return 'recorded';
  if (s === '1') return 'in_service';
  if (s === '2') return 'completed';
  if (s === '3') return 'awaiting_prepayment';
  if (s === '4' || s === 'canceled' || s === 'cancelled') return 'canceled';
  if (s === '5') return 'awaiting_confirmation';
  if (s === '6') return 'in_cart';
  if (s === '7' || s === 'moved') return 'moved_awaiting';

  if (t.includes('записан')) return 'recorded';
  if (t.includes('отмен')) return 'canceled';
  if (t.includes('ожида') && t.includes('подтвержд')) return 'awaiting_confirmation';
  if (t.includes('перенос')) return 'moved_awaiting';

  return undefined;
}

export function toRubitimeIncoming(body: RubitimeWebhookBodyValidated): RubitimeIncomingPayload {
  const data = asRecord(body.data);
  const record = asRecord(data.record);
  const rawSource = Object.keys(record).length > 0 ? record : data;
  const source = mergeRubitimeWebhookSiblingCommentFields(rawSource, data);
  const rawStatus = asString(source.status) ?? (source.status != null ? String(source.status) : undefined);
  const statusTitle = asString(source.status_title) ?? asString(source.status_name);
  const status = normalizeRubitimeStatus(rawStatus, statusTitle);
  const statusCode = asString(source.status) ?? (source.status != null ? String(source.status) : undefined);
  const recordId = asString(source.id) ?? (source.id != null ? String(source.id) : undefined);
  const phone = asString(source.phone);
  const recordAt = asString(source.record) ?? asString(source.datetime);
  const recordAtFormatted = recordAt ? formatRubitimeRecordAtForDisplay(recordAt) : undefined;
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
  const cooperatorId =
    asString(source.cooperator_id) ?? (source.cooperator_id != null ? String(source.cooperator_id) : undefined);
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
    ...(cooperatorId ? { cooperatorId } : {}),
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
    payload: { phoneNormalized: normalizeRuPhoneE164(phone), email },
  };
}

/**
 * Google Calendar projection: вызывается из Rubitime ingress (webhook) один раз на обработанное тело.
 * Слой sync по EXEC — connector, не дублировать вызов из других мест на тот же webhook.
 */
export async function syncRubitimeWebhookBodyToGoogleCalendar(
  incoming: RubitimeIncomingPayload,
  deps?: { db?: DbPort; dispatchPort?: DispatchPort },
): Promise<string | null> {
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
  if (deps === undefined) {
    return syncAppointmentToCalendar(syncPayload);
  }
  return syncAppointmentToCalendar(syncPayload, {
    ...(deps.db !== undefined ? { db: deps.db } : {}),
    ...(deps.dispatchPort !== undefined ? { dispatchPort: deps.dispatchPort } : {}),
  });
}

/** Оборачивает валидированный Rubitime webhook в универсальный IncomingEvent. */
export function rubitimeIncomingToEvent(input: {
  body: RubitimeWebhookBodyValidated;
  correlationId: string;
  eventId: string;
  gcalEventId?: string | null;
  /** When set, must already be timezone-normalized (Stage 3 webhook path). */
  incoming?: RubitimeIncomingPayload;
}): IncomingEvent {
  const incoming = input.incoming ?? toRubitimeIncoming(input.body);
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
