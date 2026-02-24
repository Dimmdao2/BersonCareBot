import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger } from '../../observability/logger.js';
import { telegramContent } from '../../content/index.js';
import { handleUpdate } from '../../domain/usecases/index.js';
import type { WebhookContent } from '../../domain/webhookContent.js';
import type { TelegramUserFrom } from '../../domain/types.js';
import type { UserPort } from '../../domain/ports/user.js';
import type { NotificationsPort } from '../../domain/ports/notifications.js';
import { linkTelegramByRubitimeRecord } from '../../domain/usecases/linkTelegramByRubitimeRecord.js';
import { getBotInstance } from './client.js';
import { fromTelegram } from './mapIn.js';
import { toTelegram, type TelegramApi } from './mapOut.js';
import { parseWebhookBody } from './schema.js';

const content: WebhookContent = telegramContent;

export type TelegramWebhookDeps = {
  userPort: UserPort;
  notificationsPort: NotificationsPort;
  getRubitimeRecordById: (rubitimeRecordId: string) => Promise<{
    rubitimeRecordId: string;
    phoneNormalized: string | null;
    payloadJson: unknown;
    recordAt: Date | null;
    status: 'created' | 'updated' | 'canceled';
  } | null>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<{
    chatId: number;
    telegramId: string;
    username: string | null;
  } | null>;
  getTelegramUserLinkData: (telegramId: string) => Promise<{
    chatId: number;
    telegramId: string;
    username: string | null;
    phoneNormalized: string | null;
  } | null>;
  setTelegramUserPhone: (telegramId: string, phoneNormalized: string) => Promise<void>;
};

export async function telegramWebhookRoutes(
  app: FastifyInstance,
  deps: TelegramWebhookDeps,
): Promise<void> {
  const {
    userPort,
    notificationsPort,
    getRubitimeRecordById,
    findTelegramUserByPhone,
    getTelegramUserLinkData,
    setTelegramUserPhone,
  } = deps;
  app.post('/webhook/telegram', async (request, reply) => {
    const reqLogger = getRequestLogger(request.id);

    try {
      const secret = env.TG_WEBHOOK_SECRET;
      if (secret) {
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== secret) {
          return reply.code(403).send({ ok: false });
        }
      }

      const parseResult = parseWebhookBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn({ err: parseResult.error.flatten(), body: request.body }, 'webhook body validation failed');
        return reply.code(400).send({ ok: false, error: 'Invalid webhook body' });
      }
      const body = parseResult.data;

      reqLogger.info(
        {
          update_id: body.update_id,
          message_id: body.message?.message_id,
          text: body.message?.text,
          from_id: body.message?.from?.id ?? body.callback_query?.from?.id,
          callback_id: body.callback_query?.id,
          callback_data: body.callback_query?.data,
        },
        'tg_update',
      );

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
        userRow = await userPort.upsertTelegramUser(body.message.from as TelegramUserFrom);
        telegramId = body.message.from.id ? String(body.message.from.id) : null;
      } else if (body.callback_query?.from) {
        userRow = await userPort.upsertTelegramUser(body.callback_query.from as TelegramUserFrom);
        telegramId = body.callback_query.from.id ? String(body.callback_query.from.id) : null;
      }

      if (updateId !== null && telegramIdForDedup !== null) {
        const isNew = await userPort.tryAdvanceLastUpdateId(Number(telegramIdForDedup), updateId);
        if (!isNew) {
          return reply.code(200).send({ ok: true });
        }
      }

      let userState: string | undefined;
      let adminForward: { chatId: number; text: string } | undefined;
      if (body.message?.from && telegramId) {
        userState = (await userPort.getTelegramUserState(telegramId)) ?? 'idle';
        if (userState === 'waiting_for_question' && body.message.text) {
          const adminId = env.ADMIN_TELEGRAM_ID != null ? Number(env.ADMIN_TELEGRAM_ID) : undefined;
          if (adminId && body.message.from) {
            const from = body.message.from;
            adminForward = {
              chatId: adminId,
              text: `Новый вопрос\nОт: ${from.first_name ?? ''} ${from.last_name ?? ''} @${from.username ?? ''}\nTelegram ID: ${telegramId}\nТекст:\n${body.message.text}`.trim(),
            };
          }
        }
      }

      const incoming = fromTelegram(body, {
        userRow,
        telegramId,
        ...(userState !== undefined && { userState }),
        ...(adminForward !== undefined && { adminForward }),
      });

      if (!incoming) {
        return reply.code(200).send({ ok: true });
      }

      const linkingStatePrefix = 'await_contact:rubitime_record:';
      if (
        incoming.kind === 'message'
        && incoming.contactPhone
        && userState?.startsWith(linkingStatePrefix)
      ) {
        const rubitimeRecordId = userState.slice(linkingStatePrefix.length);
        const linkActions = await linkTelegramByRubitimeRecord(
          {
            telegramId: incoming.telegramId,
            chatId: incoming.chatId,
            username: incoming.telegramUsername,
            rubitimeRecordId,
            contactPhone: incoming.contactPhone,
          },
          {
            adminTelegramId: env.ADMIN_TELEGRAM_ID,
            getRecordByRubitimeId: getRubitimeRecordById,
            findTelegramUserByPhone,
            getTelegramUserLinkData,
            setTelegramUserPhone,
            setTelegramUserState: userPort.setTelegramUserState,
          },
        );
        if (linkActions.length > 0) {
          try {
            await toTelegram(linkActions, getBotInstance().api as TelegramApi);
          } catch (err) {
            reqLogger.error({ err }, 'toTelegram failed for rubitime linking');
          }
        }
        return reply.code(200).send({ ok: true });
      }

      const actions = await handleUpdate(incoming, userPort, notificationsPort, content);

      if (actions.length > 0) {
        try {
          await toTelegram(actions, getBotInstance().api as TelegramApi);
        } catch (err) {
          reqLogger.error({ err }, 'toTelegram failed');
        }
      }

      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook handler failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
