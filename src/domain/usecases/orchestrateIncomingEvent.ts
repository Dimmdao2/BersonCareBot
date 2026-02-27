import type { DbWriteMutation, IncomingEvent, OrchestratorResult, OutgoingEvent } from '../contracts/index.js';
import type { NotificationsPort } from '../ports/notifications.js';
import type { UserPort } from '../ports/user.js';
import type { IncomingUpdate, OutgoingAction } from '../types.js';
import { normalizePhone } from '../phone.js';
import type { WebhookContent } from '../webhookContent.js';
import { handleUpdate } from './handleUpdate.js';

type RubitimeWebhookBody = {
  from: string;
  event: 'event-create-record' | 'event-update-record' | 'event-remove-record';
  data: Record<string, unknown>;
};

function safeStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function mapRecordStatus(event: string): 'created' | 'updated' | 'canceled' {
  if (event === 'event-create-record') return 'created';
  if (event === 'event-remove-record') return 'canceled';
  return 'updated';
}

function mapBusinessKind(event: string): 'CREATE' | 'TRANSFER_REQUEST' | 'CANCEL' {
  if (event === 'event-create-record') return 'CREATE';
  if (event === 'event-remove-record') return 'CANCEL';
  return 'TRANSFER_REQUEST';
}

function formatRecordDateTime(value: unknown): string {
  const raw = safeStr(value).trim();
  if (!raw) return '-';
  const normalized = raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} в ${hh}:${min}`;
}

function isCanceledByStatus(data: Record<string, unknown>): boolean {
  const statusTitle = safeStr(data.status_title).toLowerCase();
  const statusCode = safeStr(data.status);
  return statusTitle.includes('отмен') || statusCode === '4';
}

function isBookedByStatus(data: Record<string, unknown>): boolean {
  const statusTitle = safeStr(data.status_title).toLowerCase();
  const statusCode = safeStr(data.status);
  return statusTitle === 'записан' || statusCode === '0';
}

function buildUserText(kind: 'CREATE' | 'TRANSFER_REQUEST' | 'CANCEL', data: Record<string, unknown>): string {
  const name = safeStr(data.name) || 'Клиент';
  const service = safeStr(data.service_title) || safeStr(data.service) || 'услугу';
  const recordAt = formatRecordDateTime(data.record);
  const branch = safeStr(data.branch_title) || '-';
  const status = safeStr(data.status_title) || safeStr(data.status) || 'изменена';

  if (kind === 'CREATE') {
    return [
      `${name}, вы успешно записались на прием к Дмитрию Берсону на ${service}.`,
      '',
      `Дата и время: ${recordAt}`,
      `Адрес: ${branch}`,
    ].join('\n');
  }

  if (kind === 'CANCEL' || (kind === 'TRANSFER_REQUEST' && isCanceledByStatus(data))) {
    return `Отменена ваша запись к Дмитрию на ${recordAt}`;
  }

  if (kind === 'TRANSFER_REQUEST' && isBookedByStatus(data)) {
    return `Ваша запись на ${recordAt} подтверждена`;
  }

  return [
    'Ваша запись на прием к Дмитрию изменена:',
    `Дата и время: ${recordAt}`,
    `Статус: ${status}`,
  ].join('\n');
}

function orchestrateRubitime(event: IncomingEvent, body: RubitimeWebhookBody): OrchestratorResult {
  const data = body.data;
  const rubitimeRecordId = data.id != null ? safeStr(data.id) : null;
  const recordAt = data.record != null ? safeStr(data.record) : null;
  const phoneNormalized = data.phone != null ? normalizePhone(safeStr(data.phone)) : null;
  const kind = mapBusinessKind(body.event);

  const writes: DbWriteMutation[] = [
    {
      type: 'event.log',
      params: {
        rubitimeRecordId,
        event: body.event,
        payloadJson: body,
      },
    },
  ];

  if (rubitimeRecordId) {
    writes.push({
      type: 'booking.upsert',
      params: {
        rubitimeRecordId,
        phoneNormalized,
        recordAt,
        status: mapRecordStatus(body.event),
        payloadJson: data,
        lastEvent: body.event,
      },
    });
  }

  const outgoing: OutgoingEvent[] = [
    {
      type: 'message.send',
      meta: {
        eventId: `out_${event.meta.eventId}`,
        source: 'rubitime',
        occurredAt: new Date().toISOString(),
        ...(event.meta.correlationId ? { correlationId: event.meta.correlationId } : {}),
      },
      payload: {
        recipient: {
          phoneNormalized: phoneNormalized ?? '',
        },
        message: {
          text: buildUserText(kind, data),
        },
        fallback: {
          smsEnabled: true,
          smsText: kind === 'CANCEL' ? 'Запись отменена' : 'Требуется подтверждение записи',
        },
      },
    },
  ];

  return { reads: [], writes, outgoing };
}

export function orchestrateIncomingEvent(event: IncomingEvent): OrchestratorResult {
  if (
    (event.type === 'message.received' || event.type === 'callback.received')
    && event.meta.source === 'telegram'
  ) {
    return { reads: [], writes: [], outgoing: [] };
  }

  if (event.type === 'webhook.received' && event.meta.source === 'rubitime') {
    const body = event.payload.body as RubitimeWebhookBody | undefined;
    if (!body) return { reads: [], writes: [], outgoing: [] };
    return orchestrateRubitime(event, body);
  }
  return { reads: [], writes: [], outgoing: [] };
}

type OrchestrateIncomingDeps = {
  telegram?: {
    userPort: UserPort;
    notificationsPort: NotificationsPort;
    content: WebhookContent;
  };
};

function actionsToOutgoingEvents(actions: OutgoingAction[], event: IncomingEvent): OutgoingEvent[] {
  return actions.map((action) => ({
    type: 'message.send',
    meta: {
      eventId: `out_${event.meta.eventId}`,
      source: event.meta.source,
      occurredAt: new Date().toISOString(),
      ...(event.meta.correlationId ? { correlationId: event.meta.correlationId } : {}),
      ...(event.meta.userId ? { userId: event.meta.userId } : {}),
    },
    payload: { action },
  }));
}

export async function orchestrateIncomingEventWithDeps(
  event: IncomingEvent,
  deps: OrchestrateIncomingDeps,
): Promise<OrchestratorResult> {
  if (
    (event.type === 'message.received' || event.type === 'callback.received')
    && event.meta.source === 'telegram'
    && deps.telegram
  ) {
    const incoming = event.payload.incoming as IncomingUpdate | undefined;
    if (!incoming) return { reads: [], writes: [], outgoing: [] };
    const actions = await handleUpdate(
      incoming,
      deps.telegram.userPort,
      deps.telegram.notificationsPort,
      deps.telegram.content,
    );
    return { reads: [], writes: [], outgoing: actionsToOutgoingEvents(actions, event) };
  }

  return orchestrateIncomingEvent(event);
}
