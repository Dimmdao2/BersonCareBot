import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { telegramConfig } from './config.js';
import { normalizeTelegramAction, normalizeTelegramMessageAction } from './mapIn.js';
import { setupTelegramMenuButton } from './setupMenuButton.js';
import { parseWebhookBody } from './schema.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

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
  const adminTelegramId = telegramConfig.adminTelegramId;
  const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
  const isAdmin =
    typeof adminTelegramId === 'number' &&
    typeof chatId === 'number' &&
    chatId === adminTelegramId;

  const result: Record<string, unknown> = {
    ...(displayName ? { actor: { displayName } } : {}),
    ...(bookingUrl ? { links: { bookingUrl } } : {}),
    ...(typeof isAdmin === 'boolean' ? { isAdmin } : {}),
  };
  if (typeof adminTelegramId === 'number') result.adminChatId = adminTelegramId;
  return result;
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
      ...(typeof callback.from?.username === 'string' ? { channelUsername: callback.from.username } : {}),
      ...(typeof callback.from?.first_name === 'string' ? { channelFirstName: callback.from.first_name } : {}),
      ...(typeof callback.from?.last_name === 'string' ? { channelLastName: callback.from.last_name } : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_reply:')
        ? { conversationId: callback.data.slice('admin_reply:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_reply_continue:')
        ? { conversationId: callback.data.slice('admin_reply_continue:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_close_dialog:')
        ? { conversationId: callback.data.slice('admin_close_dialog:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('dialogs.view:')
        ? { conversationId: callback.data.slice('dialogs.view:'.length) }
        : {}),
      callbackData: action,
      callbackQueryId,
    };
  }

  if (body.message?.from && typeof body.message.chat?.id === 'number') {
    return {
      kind: 'message',
      chatId: body.message.chat.id,
      channelId: String(body.message.from.id),
      ...(typeof body.message.message_id === 'number' ? { messageId: body.message.message_id } : {}),
      text: body.message.text ?? '',
      action: normalizeTelegramMessageAction(body.message.text ?? ''),
      ...(typeof body.message.contact?.phone_number === 'string' ? { contactPhone: body.message.contact.phone_number } : {}),
      ...(typeof body.message.from.username === 'string' ? { channelUsername: body.message.from.username } : {}),
      ...(typeof body.message.from.first_name === 'string' ? { channelFirstName: body.message.from.first_name } : {}),
      ...(typeof body.message.from.last_name === 'string' ? { channelLastName: body.message.from.last_name } : {}),
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
  await setupTelegramMenuButton();

  app.post('/webhook/telegram', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const secret = telegramConfig.webhookSecret;
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
