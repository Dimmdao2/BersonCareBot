// src/routes/telegramWebhook.ts
import type { FastifyInstance } from 'fastify';
import fetch from 'node-fetch';

import { env } from '../config/env.js';
import {
  upsertTelegramUser,
  setTelegramUserState,
  getTelegramUserState,
  getNotificationSettings,
  updateNotificationSettings,
  tryAdvanceLastUpdateId,
} from '../db/telegramUsersRepo.js';
import { getRequestLogger } from '../logger.js';
import { telegramContent } from '../content/index.js';

import type { TelegramWebhookBody } from '../types/telegram.js';

type TgOkResponse<T> = { ok: true; result: T };
type TgErrResponse = { ok: false; description?: string };

async function tgCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as TgOkResponse<T> | TgErrResponse;
  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data.result;
}

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

  // Всегда закрываем "Загрузка..."
  const answer = async (): Promise<void> => {
    try {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id });
    } catch (err) {
      reqLogger.error({ err }, 'answerCallbackQuery failed');
    }
  };

  try {
    // Если нет message — можно только отвечать на callback и выйти
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

    // читаем актуальные настройки
    let settings = await getNotificationSettings(telegramIdNum);
    if (!settings) settings = { notify_spb: false, notify_msk: false, notify_online: false };

    // toggle
    if (cq.data === 'notify_toggle_spb') {
      await updateNotificationSettings(telegramIdNum, { notify_spb: !settings.notify_spb });
    } else if (cq.data === 'notify_toggle_msk') {
      await updateNotificationSettings(telegramIdNum, { notify_msk: !settings.notify_msk });
    } else if (cq.data === 'notify_toggle_online') {
      await updateNotificationSettings(telegramIdNum, { notify_online: !settings.notify_online });
    } else if (cq.data === 'notify_toggle_all') {
      const allTrue = settings.notify_spb && settings.notify_msk && settings.notify_online;
      await updateNotificationSettings(telegramIdNum, {
        notify_spb: !allTrue,
        notify_msk: !allTrue,
        notify_online: !allTrue,
      });
    } else {
      return;
    }

    // перечитываем и обновляем только reply_markup
    const fresh = (await getNotificationSettings(telegramIdNum)) ?? {
      notify_spb: false,
      notify_msk: false,
      notify_online: false,
    };

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
  app.post<{ Body: TelegramWebhookBody }>('/webhook/telegram', async (request, reply) => {
    const reqLogger = getRequestLogger(request.id);

    try {
      const secret = env.TG_WEBHOOK_SECRET;
      if (secret) {
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== secret) {
          return reply.code(403).send({ ok: false });
        }
      }

      const body = request.body;

      // --- Дедупликация апдейтов ---
      const updateId = typeof body.update_id === 'number' ? body.update_id : null;
      // Определяем telegramId (from.id):
      let telegramIdForDedup: number | null = null;
      if (body.callback_query?.from?.id) {
        telegramIdForDedup = body.callback_query.from.id;
      } else if (body.message?.from?.id) {
        telegramIdForDedup = body.message.from.id;
      }

      // upsert user (если есть from.id)
      let userRow = null;
      let telegramId: string | null = null;
      if (body.message?.from) {
        userRow = await upsertTelegramUser(body.message.from);
        telegramId = body.message.from.id ? String(body.message.from.id) : null;
      } else if (body.callback_query?.from) {
        userRow = await upsertTelegramUser(body.callback_query.from);
        telegramId = body.callback_query.from.id ? String(body.callback_query.from.id) : null;
      }

      // Если есть updateId и telegramIdForDedup, проверяем дедупликацию
      if (updateId !== null && telegramIdForDedup !== null) {
        const isNew = await tryAdvanceLastUpdateId(Number(telegramIdForDedup), updateId);
        if (!isNew) {
          return reply.code(200).send({ ok: true });
        }
      }

      // 1) callback_query (уведомления + inline-меню)
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
          // --- УВЕДОМЛЕНИЯ ---
          // ВАЖНО: handleNotificationCallback уже сам делает answerCallbackQuery (если у тебя он сделан как раньше),
          // поэтому здесь ack() НЕ вызываем, чтобы не было double-ack.
          if (data.startsWith('notify_')) {
            await handleNotificationCallback(body, request.id);
            return reply.code(200).send({ ok: true });
          }

          // --- INLINE "⚙️ Меню" ---
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
              const settings = (await getNotificationSettings(telegramIdNum)) ?? {
                notify_spb: false,
                notify_msk: false,
                notify_online: false,
              };

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

          // если добавишь кнопку "Назад" в inline-меню, используй callback_data: "menu_back"
          if (data === 'menu_back') {
            // без текста "выберите действие"
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

          // неизвестный callback — просто ack
          await ack();
          return reply.code(200).send({ ok: true });
        } catch (err) {
          reqLogger.error({ err }, 'callback_query handler failed');
          await ack();
          return reply.code(200).send({ ok: true });
        }
      }

      // 2) message flow
      const msg = body.message;
      if (!msg || !msg.chat || typeof msg.chat.id !== 'number') {
        return reply.code(200).send({ ok: true });
      }

      if (!userRow || !telegramId) {
        return reply.code(200).send({ ok: true });
      }

      let userState = (await getTelegramUserState(telegramId)) ?? 'idle';

      // важное: строка, не литеральный union
      const text: string = msg.text ?? '';

      if (text === '/start') {
        await setTelegramUserState(telegramId, 'idle');
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
        await setTelegramUserState(telegramId, 'waiting_for_question');
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
        await setTelegramUserState(telegramId, 'idle');

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
        await setTelegramUserState(telegramId, 'idle');
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

      // default
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
