import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger } from '../../logger.js';
import { telegramContent } from '../../content/index.js';
import * as telegramUserService from '../../services/telegramUserService.js';
import {
  handleStart,
  handleAsk,
  handleQuestion,
  handleBook,
  handleMore,
  handleDefaultIdle,
  handleNotificationCallback,
  handleShowNotifications,
  handleMyBookings,
  handleBack,
} from '../../core/messaging/index.js';
import type { MessagingPort } from '../../core/ports/messaging.js';
import type { WebhookContent } from '../../core/webhookContent.js';
import type { TelegramUserFrom } from '../../core/types.js';
import { tgCall } from './client.js';
import { isNotifyCallback } from './mapper.js';
import { parseWebhookBody } from './schema.js';

function createMessagingPort(): MessagingPort {
  return {
    sendMessage: (p) => tgCall('sendMessage', p),
    editMessageText: (p) => tgCall('editMessageText', p),
    editMessageReplyMarkup: (p) => tgCall('editMessageReplyMarkup', p),
    answerCallbackQuery: (p) => tgCall('answerCallbackQuery', p),
  };
}

const content: WebhookContent = telegramContent;

export async function telegramWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhook/telegram', async (request, reply) => {
    const reqLogger = getRequestLogger(request.id);
    const userPort = telegramUserService.userPort;
    const notificationsPort = telegramUserService.notificationsPort;
    const messagingPort = createMessagingPort();

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

      if (body.callback_query) {
        const cq = body.callback_query;
        const data = cq.data ?? '';

        const ack = async (): Promise<void> => {
          try {
            await messagingPort.answerCallbackQuery({ callback_query_id: cq.id });
          } catch (err) {
            reqLogger.error({ err }, 'answerCallbackQuery failed');
          }
        };

        try {
          if (isNotifyCallback(data)) {
            if (
              cq.message &&
              'chat' in cq.message &&
              cq.message.chat &&
              typeof cq.message.chat.id === 'number' &&
              typeof cq.message.message_id === 'number'
            ) {
              await handleNotificationCallback(
                cq.from.id,
                cq.message.chat.id,
                cq.message.message_id,
                data,
                notificationsPort,
                messagingPort,
                content,
              );
            }
            await ack();
            return reply.code(200).send({ ok: true });
          }

          if (typeof cq.message?.chat?.id !== 'number' || typeof cq.message.message_id !== 'number') {
            await ack();
            return reply.code(200).send({ ok: true });
          }

          const chatId = cq.message.chat.id;
          const messageId = cq.message.message_id;
          const telegramIdNum = cq.from?.id ?? null;

          if (data === 'menu_notifications') {
            if (telegramIdNum !== null) {
              try {
                await handleShowNotifications(
                  chatId,
                  messageId,
                  telegramIdNum,
                  notificationsPort,
                  messagingPort,
                  content,
                );
              } catch (err) {
                reqLogger.error({ err }, 'editMessageText (show notifications) failed');
              }
            }
            await ack();
            return reply.code(200).send({ ok: true });
          }

          if (data === 'menu_my_bookings') {
            try {
              await handleMyBookings(chatId, messageId, messagingPort, content);
            } catch (err) {
              reqLogger.error({ err }, 'editMessageText (myBookings) failed');
            }
            await ack();
            return reply.code(200).send({ ok: true });
          }

          if (data === 'menu_back') {
            try {
              await handleBack(chatId, messageId, messagingPort, content);
            } catch (err) {
              reqLogger.error({ err }, 'editMessageText (back) failed');
            }
            await ack();
            return reply.code(200).send({ ok: true });
          }

          await ack();
          return reply.code(200).send({ ok: true });
        } catch (err) {
          reqLogger.error({ err }, 'callback_query handler failed');
          await ack();
          return reply.code(200).send({ ok: true });
        }
      }

      const msg = body.message;
      if (!msg || !msg.chat || typeof msg.chat.id !== 'number') {
        return reply.code(200).send({ ok: true });
      }

      if (!userRow || !telegramId) {
        return reply.code(200).send({ ok: true });
      }

      const userState = (await userPort.getTelegramUserState(telegramId)) ?? 'idle';
      const text: string = msg.text ?? '';

      if (text === '/start') {
        try {
          const consumed = await handleStart(
            msg.chat.id,
            Number(telegramId),
            userPort,
            messagingPort,
            content,
          );
          if (!consumed) return reply.code(200).send({ ok: true });
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (/start) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (text === content.mainMenu.ask) {
        try {
          await handleAsk(msg.chat.id, telegramId, userPort, messagingPort, content);
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (ask) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (userState === 'waiting_for_question' && text) {
        const adminId = env.ADMIN_TELEGRAM_ID != null ? Number(env.ADMIN_TELEGRAM_ID) : undefined;
        const adminMsg =
          adminId && msg.from
            ? `Новый вопрос\nОт: ${msg.from.first_name ?? ''} ${msg.from.last_name ?? ''} @${msg.from.username ?? ''}\nTelegram ID: ${telegramId}\nТекст:\n${text}`.trim()
            : undefined;
        const forwardToAdmin = async (adminChatId: number, message: string): Promise<void> => {
          await messagingPort.sendMessage({ chat_id: adminChatId, text: message });
        };
        try {
          await handleQuestion(
            msg.chat.id,
            telegramId,
            text,
            userPort,
            messagingPort,
            content,
            adminId,
            adminMsg,
            forwardToAdmin,
          );
        } catch (err) {
          reqLogger.error({ err }, 'handleQuestion failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (text === content.mainMenu.book) {
        try {
          await handleBook(msg.chat.id, telegramId, userPort, messagingPort, content);
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (book placeholder) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (text === content.mainMenu.more) {
        try {
          await handleMore(msg.chat.id, messagingPort, content);
        } catch (err) {
          reqLogger.error({ err }, 'Telegram send inline moreMenu failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (userState === 'idle') {
        try {
          await handleDefaultIdle(msg.chat.id, messagingPort, content);
        } catch (err) {
          reqLogger.error({ err }, 'sendMainMenu (default) failed');
        }
      }

      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook handler failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
