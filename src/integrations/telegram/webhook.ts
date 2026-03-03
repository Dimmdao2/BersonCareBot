import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import { getBotInstance } from './client.js';
import { telegramContent, buildAdminForwardText } from '../../content/telegram/content.js';
import type { WebhookContent } from '../../kernel/domain/webhookContent.js';
import type { TelegramUserFrom } from '../../kernel/domain/types.js';
import type { UserPort } from '../../kernel/domain/ports/user.js';
import type { NotificationsPort } from '../../kernel/domain/ports/notifications.js';
import { handleUpdate } from '../../kernel/domain/usecases/handleUpdate.js';
import { toTelegram, type TelegramApi } from './mapOut.js';
import { fromTelegram } from './mapIn.js';
import { parseWebhookBody } from './schema.js';

/** Dependencies for Telegram webhook handler registration. */
const content: WebhookContent = telegramContent;

export type TelegramWebhookDeps = {
  userPort: UserPort;
  notificationsPort: NotificationsPort;
  getTelegramUserLinkData: (telegramId: string) => Promise<{
    chatId: number;
    telegramId: string;
    username: string | null;
    phoneNormalized: string | null;
  } | null>;
};

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

      const updateId = typeof body.update_id === 'number' ? body.update_id : null;
      let telegramIdForDedup: number | null = null;
      if (body.callback_query?.from?.id) {
        telegramIdForDedup = body.callback_query.from.id;
      } else if (body.message?.from?.id) {
        telegramIdForDedup = body.message.from.id;
      }

      let userRow: { id: string; telegram_id: string } | null = null;
      let telegramId: string | null = null;
      if (body.message?.from) {
        userRow = await deps.userPort.upsertTelegramUser(body.message.from as TelegramUserFrom);
        telegramId = body.message.from.id ? String(body.message.from.id) : null;
      } else if (body.callback_query?.from) {
        userRow = await deps.userPort.upsertTelegramUser(body.callback_query.from as TelegramUserFrom);
        telegramId = body.callback_query.from.id ? String(body.callback_query.from.id) : null;
      }

      if (updateId !== null && telegramIdForDedup !== null) {
        const isNew = await deps.userPort.tryAdvanceLastUpdateId(Number(telegramIdForDedup), updateId);
        if (!isNew) {
          return reply.code(200).send({ ok: true });
        }
      }

      let userState: string | undefined;
      let hasLinkedPhone = false;
      let adminForward: { chatId: number; text: string } | undefined;
      if (telegramId) {
        const userLinkData = await deps.getTelegramUserLinkData(telegramId);
        hasLinkedPhone = Boolean(userLinkData?.phoneNormalized);
      }
      if (body.message?.from && telegramId) {
        userState = (await deps.userPort.getTelegramUserState(telegramId)) ?? 'idle';
        if (userState === 'waiting_for_question' && body.message.text) {
          const adminId = env.ADMIN_TELEGRAM_ID != null ? Number(env.ADMIN_TELEGRAM_ID) : undefined;
          if (adminId && body.message.from) {
            const from = body.message.from;
            adminForward = {
              chatId: adminId,
              text: buildAdminForwardText({
                firstName: from.first_name ?? null,
                lastName: from.last_name ?? null,
                username: from.username ?? null,
                telegramId,
                messageText: body.message.text,
              }),
            };
          }
        }
      }

      const incoming = fromTelegram(body, {
        userRow,
        telegramId,
        ...(userState !== undefined && { userState }),
        hasLinkedPhone,
        ...(adminForward !== undefined && { adminForward }),
      });

      if (!incoming) return reply.code(200).send({ ok: true });

      const actions = await handleUpdate(
        incoming,
        deps.userPort,
        deps.notificationsPort,
        content,
      );
      if (actions.length > 0) {
        try {
          await toTelegram(actions, getBotInstance().api as TelegramApi);
        } catch (err) {
          reqLogger.error({ err }, 'toTelegram failed');
        }
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
