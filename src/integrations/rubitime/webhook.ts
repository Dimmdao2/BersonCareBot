import type { FastifyInstance } from 'fastify';
import { getRequestLogger } from '../../observability/logger.js';
import { parseRubitimeBody } from './schema.js';

/** Минимальный контракт для отправки сообщения в Telegram (для тестов и подстановки api). */
export type RubitimeTelegramApi = {
  sendMessage(chatId: number, text: string): Promise<unknown>;
};

export type RubitimeWebhookDeps = {
  tgApi: RubitimeTelegramApi;
  inboxChatId: string;
  /** Токен для проверки (header X-Rubitime-Token). */
  webhookToken: string;
};

function eventLabel(event: string): string {
  switch (event) {
    case 'event-create-record':
      return 'create';
    case 'event-update-record':
      return 'update';
    case 'event-remove-record':
      return 'remove';
    default:
      return event;
  }
}

function safeStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function buildNotificationText(data: Record<string, unknown>): string {
  const lines: string[] = ['Rubitime', `Событие: ${eventLabel((data.event as string) ?? '')}`];
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
  return lines.join('\n');
}

export function rubitimeWebhookRoutes(app: FastifyInstance, deps: RubitimeWebhookDeps): void {
  const { tgApi, inboxChatId, webhookToken } = deps;
  const chatIdNum = Number(inboxChatId);

  app.post('/webhook/rubitime', async (request, reply) => {
    const reqLogger = getRequestLogger(request.id);

    const token = request.headers['x-rubitime-token'];
    if (typeof token !== 'string' || token !== webhookToken) {
      return reply.code(403).send({ ok: false });
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

    const text = buildNotificationText({ ...body.data, event: body.event });

    try {
      await tgApi.sendMessage(chatIdNum, text);
    } catch (err) {
      reqLogger.error({ err }, 'rubitime: sendMessage to Telegram failed');
    }

    return reply.code(200).send({ ok: true });
  });
}
