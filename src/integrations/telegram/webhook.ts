import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { normalizeTelegramAction, normalizeTelegramMessageAction } from './mapIn.js';
import { parseWebhookBody } from './schema.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

function parseTelegramChatId(value: string | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function joinDisplayName(input: { first_name?: string | undefined; last_name?: string | undefined }): string | undefined {
  const parts = [input.first_name, input.last_name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function buildTelegramFacts(body: TelegramWebhookBodyValidated): Record<string, unknown> {
  const from = body.callback_query?.from ?? body.message?.from;
  const displayName = from ? joinDisplayName(from) : undefined;
  const bookingUrl = env.BOOKING_URL;
  const adminTelegramId = parseTelegramChatId(env.ADMIN_TELEGRAM_ID);

  const admin: Record<string, unknown> = {};
  if (typeof adminTelegramId === 'number') admin.adminTelegramId = adminTelegramId;

  return {
    ...(displayName ? { actor: { displayName } } : {}),
    ...(bookingUrl ? { links: { bookingUrl } } : {}),
    ...(Object.keys(admin).length > 0 ? { admin } : {}),
  };
}

export type TelegramWebhookDeps = {
  eventGateway: EventGateway;
};

function mapBodyToIncoming(body: TelegramWebhookBodyValidated): IncomingUpdate | null {
  if (body.callback_query) {
    const callback = body.callback_query;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const telegramId = callback.from?.id;
    const action = normalizeTelegramAction(callback.data ?? '');
    const callbackQueryId = callback.id;
    // Логгирование для диагностики проблем с callback
    console.log('[telegram][mapBodyToIncoming] callback params:', {
      chatId,
      messageId,
      telegramId,
      action,
      callbackQueryId,
    });
    if (typeof chatId !== 'number' || typeof messageId !== 'number' || typeof telegramId !== 'number') {
      console.warn('[telegram][mapBodyToIncoming] missing required callback params', {
        chatId,
        messageId,
        telegramId,
        action,
        callbackQueryId,
      });
      return null;
    }
    return {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: telegramId,
      action,
      callbackData: action,
      callbackQueryId,
    };
  }

  if (body.message?.from && typeof body.message.chat?.id === 'number') {
    return {
      kind: 'message',
      chatId: body.message.chat.id,
      channelId: String(body.message.from.id),
      text: body.message.text ?? '',
      action: normalizeTelegramMessageAction(body.message.text ?? ''),
      ...(typeof body.message.contact?.phone_number === 'string' ? { contactPhone: body.message.contact.phone_number } : {}),
      ...(typeof body.message.from.username === 'string' ? { channelUsername: body.message.from.username } : {}),
      userRow: null,
      userState: '',
    };
  }

  return null;
}

/**
 * Registers Telegram webhook route in integrations layer.
 * Flow: auth -> validate -> map -> eventGateway.
 */
export async function registerTelegramWebhookRoutes(
  app: FastifyInstance,
  deps: TelegramWebhookDeps,
): Promise<void> {
  app.post('/webhook/telegram', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const secret = env.TG_WEBHOOK_SECRET;
      if (secret) {
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== secret) return reply.code(403).send({ ok: false });
      }

      const parseResult = parseWebhookBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'telegram webhook body validation failed',
        );
        return reply.code(400).send({ ok: false, error: 'Invalid webhook body' });
      }

      const body = parseResult.data;
      const incoming = mapBodyToIncoming(body);
      if (!incoming) return reply.code(200).send({ ok: true });

      const event = telegramIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: buildTelegramFacts(body),
        ...(typeof body.update_id === 'number' ? { updateId: body.update_id } : {}),
      });
      await deps.eventGateway.handleIncomingEvent(event);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
