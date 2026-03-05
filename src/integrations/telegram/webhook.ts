import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway, IncomingEvent } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { parseWebhookBody } from './schema.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

export type TelegramWebhookDeps = {
  eventGateway: EventGateway;
  onAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
};

function mapBodyToIncoming(body: TelegramWebhookBodyValidated): IncomingUpdate | null {
  if (body.callback_query) {
    const callback = body.callback_query;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const telegramId = callback.from?.id;
    if (typeof chatId !== 'number' || typeof messageId !== 'number' || typeof telegramId !== 'number') {
      return null;
    }
    return {
      kind: 'callback',
      chatId,
      messageId,
      telegramId,
      callbackData: callback.data ?? '',
      callbackQueryId: callback.id,
    };
  }

  if (body.message?.from && typeof body.message.chat?.id === 'number') {
    return {
      kind: 'message',
      chatId: body.message.chat.id,
      telegramId: String(body.message.from.id),
      text: body.message.text ?? '',
      ...(typeof body.message.contact?.phone_number === 'string' ? { contactPhone: body.message.contact.phone_number } : {}),
      ...(typeof body.message.from.username === 'string' ? { telegramUsername: body.message.from.username } : {}),
      userRow: null,
      userState: 'idle',
      hasLinkedPhone: false,
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
        ...(typeof body.update_id === 'number' ? { updateId: body.update_id } : {}),
      });
      const gatewayResult = await deps.eventGateway.handleIncomingEvent(event);
      if (gatewayResult.status === 'accepted' && deps.onAcceptedEvent) {
        try {
          await deps.onAcceptedEvent(event);
        } catch (err) {
          reqLogger.error({ err }, 'telegram accepted-event pipeline failed');
        }
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
