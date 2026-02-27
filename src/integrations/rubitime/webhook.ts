import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../observability/logger.js';
import { normalizePhone } from '../../domain/phone.js';
import type { SmsClient } from '../smsc/types.js';
import type { InsertRubitimeEventInput, UpsertRubitimeRecordInput } from '../../db/repos/rubitimeRecords.js';
import { parseRubitimeBody } from './schema.js';

/** Минимальный контракт для отправки сообщения в Telegram (для тестов и подстановки api). */
export type RubitimeTelegramApi = {
  sendMessage(chatId: number, text: string): Promise<unknown>;
};

export type RubitimeTelegramUser = {
  chatId: number;
  telegramId: string;
  username: string | null;
};

export type RubitimeWebhookDeps = {
  tgApi: RubitimeTelegramApi;
  smsClient: SmsClient;
  insertEvent: (input: InsertRubitimeEventInput) => Promise<void>;
  upsertRecord: (input: UpsertRubitimeRecordInput) => Promise<void>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<RubitimeTelegramUser | null>;
  /** Токен для проверки во входящем path /webhook/rubitime/:token. */
  webhookToken: string;
};

function extractIncomingToken(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const value = (params as Record<string, unknown>).token;
  return typeof value === 'string' ? value : null;
}

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

export function rubitimeWebhookRoutes(app: FastifyInstance, deps: RubitimeWebhookDeps): void {
  const { tgApi, smsClient, insertEvent, upsertRecord, findTelegramUserByPhone, webhookToken } = deps;

  const handler = async (request: {
    id: string;
    headers: Record<string, unknown>;
    query: unknown;
    params: unknown;
    body: unknown;
  }, reply: {
    code: (statusCode: number) => { send: (payload: unknown) => unknown };
  }) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    const incomingToken = extractIncomingToken(request.params);
    if (incomingToken !== webhookToken) {
      return reply.code(403).send({ ok: false });
    }

    const parseResult = parseRubitimeBody(request.body);
    if (!parseResult.success) {
      reqLogger.warn(
        { err: parseResult.error.flatten(), hasBody: request.body != null },
        'rubitime webhook body validation failed',
      );
      return reply.code(400).send({ ok: false, error: 'Invalid webhook body' });
    }
    const body = parseResult.data;
    const data = body.data;
    const recordIdRaw = data.id;
    const rubitimeRecordId = recordIdRaw !== undefined && recordIdRaw !== null ? safeStr(recordIdRaw) : null;
    const recordAtRaw = data.record;
    const recordAt = recordAtRaw !== undefined && recordAtRaw !== null ? safeStr(recordAtRaw) : null;
    const phoneRaw = data.phone;
    const phoneNormalized =
      phoneRaw !== undefined && phoneRaw !== null ? normalizePhone(safeStr(phoneRaw)) : null;
    const kind = mapBusinessKind(body.event);

    await insertEvent({
      rubitimeRecordId,
      event: body.event,
      payloadJson: body,
    });

    if (rubitimeRecordId) {
      await upsertRecord({
        rubitimeRecordId,
        phoneNormalized,
        recordAt,
        status: mapRecordStatus(body.event),
        payloadJson: data,
        lastEvent: body.event,
      });
    } else {
      reqLogger.warn({ body }, 'rubitime payload has no data.id, upsert skipped');
    }

    const fallback = async () => {
      await smsClient.sendSms({
        toPhone: phoneNormalized ?? '',
        message: kind === 'CANCEL' ? 'Запись отменена' : 'Требуется подтверждение записи',
      });
    };

    if (!phoneNormalized) {
      await fallback();
      return reply.code(200).send({ ok: true });
    }

    const user = await findTelegramUserByPhone(phoneNormalized);
    if (!user) {
      await fallback();
      return reply.code(200).send({ ok: true });
    }

    try {
      await tgApi.sendMessage(user.chatId, buildUserText(kind, data));
    } catch (err) {
      reqLogger.error({ err }, 'rubitime: sendMessage to user failed');
      await fallback();
    }

    return reply.code(200).send({ ok: true });
  };

  app.post('/webhook/rubitime/:token', handler);
}
