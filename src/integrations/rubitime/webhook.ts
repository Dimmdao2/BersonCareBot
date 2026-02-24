import type { FastifyInstance } from 'fastify';
import { getRequestLogger } from '../../observability/logger.js';
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
  adminTelegramId: string;
  /** Токен для проверки (header X-Rubitime-Token). */
  webhookToken: string;
  /** Отправлять админу raw webhook payload для отладки. */
  debugNotifyAdmin?: boolean;
};

function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function extractIncomingToken(request: {
  headers: Record<string, unknown>;
  query: unknown;
  params: unknown;
}): string | null {
  const headerToken = firstString(request.headers['x-rubitime-token']);
  if (headerToken) return headerToken;

  if (request.query && typeof request.query === 'object') {
    const queryToken = firstString((request.query as Record<string, unknown>).token);
    if (queryToken) return queryToken;
  }

  if (request.params && typeof request.params === 'object') {
    const pathToken = firstString((request.params as Record<string, unknown>).token);
    if (pathToken) return pathToken;
  }

  return null;
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

function formatDetails(data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const id = data.id;
  if (id !== undefined && id !== null) lines.push(`ID: ${safeStr(id)}`);
  const record = data.record;
  if (record !== undefined && record !== null) lines.push(`Дата/время: ${safeStr(record)}`);
  const name = data.name;
  if (name !== undefined && name !== null) lines.push(`Имя: ${safeStr(name)}`);
  const phone = data.phone;
  if (phone !== undefined && phone !== null) lines.push(`Телефон: ${safeStr(phone)}`);
  const service = data.service;
  if (service !== undefined && service !== null) lines.push(`Услуга: ${safeStr(service)}`);
  return lines;
}

function buildUserText(kind: 'CREATE' | 'TRANSFER_REQUEST' | 'CANCEL', data: Record<string, unknown>): string {
  const name = safeStr(data.name) || 'Клиент';
  const service = safeStr(data.service_title) || safeStr(data.service) || 'услугу';
  const recordAt = safeStr(data.record) || '-';
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

  if (kind === 'CANCEL') {
    return `Отменена ваша запись к Дмитрию на ${recordAt}`;
  }

  return [
    'Ваша запись на прием к Дмитрию изменена:',
    `Дата и время: ${recordAt}`,
    `Статус: ${status}`,
  ].join('\n');
}

function buildFallbackAdminText(reason: string, phoneNormalized: string | null, data: Record<string, unknown>): string {
  const details = formatDetails(data);
  return [
    'Rubitime: пользователь не уведомлён, требуется SMS',
    `Причина: ${reason}`,
    `Телефон: ${phoneNormalized ?? '-'}`,
    ...details,
  ].join('\n');
}

function splitForTelegram(text: string, maxLen = 3500): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

function buildAdminWebhookPayloadTexts(rawBody: unknown): string[] {
  const json = JSON.stringify(rawBody, null, 2) ?? String(rawBody);
  const fullText = `Rubitime webhook payload (raw)\n${json}`;
  return splitForTelegram(fullText);
}

export function rubitimeWebhookRoutes(app: FastifyInstance, deps: RubitimeWebhookDeps): void {
  const {
    tgApi,
    smsClient,
    insertEvent,
    upsertRecord,
    findTelegramUserByPhone,
    adminTelegramId,
    webhookToken,
    debugNotifyAdmin = false,
  } = deps;
  const adminChatId = Number(adminTelegramId);

  const handler = async (request: {
    id: string;
    headers: Record<string, unknown>;
    query: unknown;
    params: unknown;
    body: unknown;
  }, reply: {
    code: (statusCode: number) => { send: (payload: unknown) => unknown };
  }) => {
    const reqLogger = getRequestLogger(request.id);

    const incomingToken = extractIncomingToken(request);
    if (incomingToken !== webhookToken) {
      return reply.code(403).send({ ok: false });
    }

    if (debugNotifyAdmin && Number.isFinite(adminChatId)) {
      try {
        const payloadMessages = buildAdminWebhookPayloadTexts(request.body);
        for (const text of payloadMessages) {
          // Send raw webhook payload for each accepted Rubitime event.
          await tgApi.sendMessage(adminChatId, text);
        }
      } catch (err) {
        reqLogger.error({ err }, 'rubitime: failed to send raw webhook payload to admin');
      }
    }

    const parseResult = parseRubitimeBody(request.body);
    if (!parseResult.success) {
      reqLogger.warn(
        { err: parseResult.error.flatten(), body: request.body },
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

    const fallback = async (reason: string, notifyAdmin = true) => {
      await smsClient.sendSms({
        toPhone: phoneNormalized ?? '',
        message: kind === 'CANCEL' ? 'Запись отменена' : 'Требуется подтверждение записи',
      });
      if (notifyAdmin && Number.isFinite(adminChatId)) {
        try {
          await tgApi.sendMessage(adminChatId, buildFallbackAdminText(reason, phoneNormalized, data));
        } catch (err) {
          reqLogger.error({ err }, 'rubitime: failed to notify admin on fallback');
        }
      }
    };

    if (!phoneNormalized) {
      await fallback('PHONE_NOT_FOUND_IN_PAYLOAD');
      return reply.code(200).send({ ok: true });
    }

    const user = await findTelegramUserByPhone(phoneNormalized);
    if (!user) {
      await fallback('USER_NOT_FOUND_BY_PHONE');
      return reply.code(200).send({ ok: true });
    }

    try {
      await tgApi.sendMessage(user.chatId, buildUserText(kind, data));
    } catch (err) {
      reqLogger.error({ err }, 'rubitime: sendMessage to user failed');
      await fallback('TELEGRAM_SEND_FAILED', false);
    }

    return reply.code(200).send({ ok: true });
  };

  app.post('/webhook/rubitime', handler);
  app.post('/webhook/rubitime/:token', handler);
}
