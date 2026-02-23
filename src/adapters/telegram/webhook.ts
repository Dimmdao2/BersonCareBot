import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger } from '../../logger.js';
import { telegramContent } from '../../content/index.js';
import type { TelegramWebhookBody } from '../../core/types.js';
import * as telegramUsersRepo from '../../services/telegramUserService.js';
import { tgCall } from './client.js';
import { isNotifyCallback } from './mapper.js';
import { parseWebhookBody } from './schema.js';

function sendMainMenu(chatId: number): Promise<unknown> {
  return tgCall('sendMessage', {
    chat_id: chatId,
    text: telegramContent.messages.chooseMenu,
    reply_markup: {
      keyboard: telegramContent.mainMenuKeyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}

async function handleNotificationCallback(body: TelegramWebhookBody, reqId: string): Promise<void> {
  const reqLogger = getRequestLogger(reqId);

  const cq = body.callback_query;
  if (!cq?.from || !cq.id || !cq.data) return;

  const telegramIdNum = cq.from.id;

  const answer = async (): Promise<void> => {
    try {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id });
    } catch (err) {
      reqLogger.error({ err }, 'answerCallbackQuery failed');
    }
  };

  try {
    if (
      !cq.message ||
      !('chat' in cq.message) ||
      !cq.message.chat ||
      typeof cq.message.chat.id !== 'number' ||
      typeof cq.message.message_id !== 'number'
    ) {
      return;
    }

    const chatId = cq.message.chat.id;
    const messageId = cq.message.message_id;

    let settings = await telegramUsersRepo.getNotificationSettings(telegramIdNum);
    if (!settings) settings = { notify_spb: false, notify_msk: false, notify_online: false };

    if (cq.data === 'notify_toggle_spb') {
      await telegramUsersRepo.updateNotificationSettings(telegramIdNum, {
        notify_spb: !settings.notify_spb,
      });
    } else if (cq.data === 'notify_toggle_msk') {
      await telegramUsersRepo.updateNotificationSettings(telegramIdNum, {
        notify_msk: !settings.notify_msk,
      });
    } else if (cq.data === 'notify_toggle_online') {
      await telegramUsersRepo.updateNotificationSettings(telegramIdNum, {
        notify_online: !settings.notify_online,
      });
    } else if (cq.data === 'notify_toggle_all') {
      const allTrue = settings.notify_spb && settings.notify_msk && settings.notify_online;
      await telegramUsersRepo.updateNotificationSettings(telegramIdNum, {
        notify_spb: !allTrue,
        notify_msk: !allTrue,
        notify_online: !allTrue,
      });
    } else {
      return;
    }

    const fresh =
      (await telegramUsersRepo.getNotificationSettings(telegramIdNum)) ?? ({
        notify_spb: false,
        notify_msk: false,
        notify_online: false,
      } as const);

    const kb = telegramContent.buildNotificationKeyboard(fresh);

    try {
      await tgCall('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: kb,
      });
    } catch (err) {
      reqLogger.error({ err }, 'editMessageReplyMarkup failed');
    }
  } catch (err) {
    reqLogger.error({ err }, 'notification callback error');
  } finally {
    await answer();
  }
}

export async function telegramWebhookRoutes(app: FastifyInstance): Promise<void> {
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
        userRow = await telegramUsersRepo.upsertTelegramUser(body.message.from);
        telegramId = body.message.from.id ? String(body.message.from.id) : null;
      } else if (body.callback_query?.from) {
        userRow = await telegramUsersRepo.upsertTelegramUser(body.callback_query.from);
        telegramId = body.callback_query.from.id ? String(body.callback_query.from.id) : null;
      }

      if (updateId !== null && telegramIdForDedup !== null) {
        const isNew = await telegramUsersRepo.tryAdvanceLastUpdateId(
          Number(telegramIdForDedup),
          updateId,
        );
        if (!isNew) {
          return reply.code(200).send({ ok: true });
        }
      }

      if (body.callback_query) {
        const cq = body.callback_query;
        const data = cq.data ?? '';

        const ack = async () => {
          try {
            await tgCall('answerCallbackQuery', { callback_query_id: cq.id });
          } catch (err) {
            reqLogger.error({ err }, 'answerCallbackQuery failed');
          }
        };

        try {
          if (isNotifyCallback(data)) {
            await handleNotificationCallback(body, request.id);
            return reply.code(200).send({ ok: true });
          }

          if (!cq.message?.chat?.id || typeof cq.message.message_id !== 'number') {
            await ack();
            return reply.code(200).send({ ok: true });
          }

          const chatId = cq.message.chat.id;
          const messageId = cq.message.message_id;

          if (data === 'menu_notifications') {
            const telegramIdNum = cq.from?.id ? Number(cq.from.id) : null;
            if (!telegramIdNum) {
              await ack();
              return reply.code(200).send({ ok: true });
            }

            try {
              const settings =
                (await telegramUsersRepo.getNotificationSettings(telegramIdNum)) ?? ({
                  notify_spb: false,
                  notify_msk: false,
                  notify_online: false,
                } as const);

              const kb = telegramContent.buildNotificationKeyboard(settings);

              await tgCall('editMessageText', {
                chat_id: chatId,
                message_id: messageId,
                text: `${telegramContent.notificationSettings.title}\n\n${telegramContent.notificationSettings.subtitle}`,
                reply_markup: kb,
              });
            } catch (err) {
              reqLogger.error({ err }, 'editMessageText (show notifications) failed');
            }

            await ack();
            return reply.code(200).send({ ok: true });
          }

          if (data === 'menu_my_bookings') {
            try {
              await tgCall('editMessageText', {
                chat_id: chatId,
                message_id: messageId,
                text: telegramContent.messages.bookingMy,
                reply_markup: telegramContent.moreMenuInline,
              });
            } catch (err) {
              reqLogger.error({ err }, 'editMessageText (myBookings) failed');
            }

            await ack();
            return reply.code(200).send({ ok: true });
          }

          if (data === 'menu_back') {
            try {
              await tgCall('editMessageText', {
                chat_id: chatId,
                message_id: messageId,
                text: ' ',
                reply_markup: telegramContent.moreMenuInline,
              });
            } catch (err) {
              reqLogger.error({ err }, 'editMessageText (back) failed');
              try {
                await tgCall('editMessageReplyMarkup', {
                  chat_id: chatId,
                  message_id: messageId,
                  reply_markup: telegramContent.moreMenuInline,
                });
              } catch (err2) {
                reqLogger.error({ err: err2 }, 'editMessageReplyMarkup (back) failed');
              }
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

      let userState = (await telegramUsersRepo.getTelegramUserState(telegramId)) ?? 'idle';

      const text: string = msg.text ?? '';

      if (text === '/start') {
        await telegramUsersRepo.setTelegramUserState(telegramId, 'idle');
        const allow = await telegramUsersRepo.tryConsumeStart(Number(telegramId));
        if (!allow) {
          return reply.code(200).send({ ok: true });
        }
        try {
          await tgCall('sendMessage', {
            chat_id: msg.chat.id,
            text: telegramContent.messages.welcome,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (/start) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (text === telegramContent.mainMenu.ask) {
        await telegramUsersRepo.setTelegramUserState(telegramId, 'waiting_for_question');
        try {
          await tgCall('sendMessage', {
            chat_id: msg.chat.id,
            text: telegramContent.messages.describeQuestion,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (ask) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (userState === 'waiting_for_question' && text) {
        await telegramUsersRepo.setTelegramUserState(telegramId, 'idle');

        const adminId = env.ADMIN_TELEGRAM_ID;
        if (adminId) {
          const from = msg.from;
          const userInfo = `От: ${from?.first_name ?? ''} ${from?.last_name ?? ''} @${
            from?.username ?? ''
          }`.trim();
          const adminMsg = `Новый вопрос\n${userInfo}\nTelegram ID: ${telegramId}\nТекст:\n${text}`;

          try {
            await tgCall('sendMessage', { chat_id: adminId, text: adminMsg });
          } catch (err) {
            reqLogger.error({ err }, 'sendMessage (to admin) failed');
          }
        }

        try {
          await tgCall('sendMessage', {
            chat_id: msg.chat.id,
            text: telegramContent.messages.questionAccepted,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (questionAccepted) failed');
        }

        return reply.code(200).send({ ok: true });
      }

      if (text === telegramContent.mainMenu.book) {
        await telegramUsersRepo.setTelegramUserState(telegramId, 'idle');
        try {
          await tgCall('sendMessage', {
            chat_id: msg.chat.id,
            text: telegramContent.messages.notImplemented,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, 'sendMessage (book placeholder) failed');
        }
        return reply.code(200).send({ ok: true });
      }

      if (text === telegramContent.mainMenu.more) {
        try {
          await tgCall('sendMessage', {
            chat_id: msg.chat.id,
            text: telegramContent.messages.chooseMenu,
            reply_markup: telegramContent.moreMenuInline,
          });
        } catch (err) {
          reqLogger.error({ err }, 'Telegram send inline moreMenu failed');
        }

        return reply.code(200).send({ ok: true });
      }

      if (userState === 'idle') {
        try {
          await sendMainMenu(msg.chat.id);
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
