// src/routes/telegramWebhook.ts
import type { FastifyInstance } from "fastify";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { upsertTelegramUser, setTelegramUserState, getTelegramUserState, getNotificationSettings, updateNotificationSettings } from "../db/telegramUsersRepo.js";
import { logger, getRequestLogger } from "../logger.js";
import { telegramContent } from "../content/index.js";

import type { TelegramWebhookBody } from "../types/telegram.js";



function sendMainMenu(chat_id: number | string) {
  return tgCall("sendMessage", {
    chat_id,
    text: telegramContent.messages.chooseMenu,
    reply_markup: {
      keyboard: telegramContent.mainMenuKeyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}

function sendMoreMenu(chat_id: number | string) {
  return tgCall("sendMessage", {
    chat_id,
    text: telegramContent.messages.chooseMenu,
    reply_markup: {
      keyboard: telegramContent.moreMenuKeyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}

const IS_TEST =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  process.env.CI === "true";

const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

export async function tgCall(method: string, payload: Record<string, unknown>): Promise<void> {
  // В тестах не ходим в реальный Telegram API
  if (IS_TEST) return;

  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    let desc: string | undefined;

    if (
      typeof data === "object" &&
      data !== null &&
      "description" in data &&
      typeof (data as { description?: unknown }).description === "string"
    ) {
      desc = (data as { description: string }).description;
    }

    throw new Error(desc || `Telegram API error: ${method} (${res.status})`);
  }
}

export async function telegramWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhook/telegram", async (request, reply) => {
    const secretHeader = request.headers["x-telegram-bot-api-secret-token"];
    const expectedSecret = env.TG_WEBHOOK_SECRET;

    if (typeof expectedSecret === "string") {
      if (typeof secretHeader !== "string" || secretHeader !== expectedSecret) {
        return reply.code(403).send({ ok: false });
      }
    }

    const body = request.body as TelegramWebhookBody;
    const requestId = body.update_id ? String(body.update_id) : undefined;
    const reqLogger = requestId ? getRequestLogger(requestId) : logger;

    const msg = body.message;
    if (msg?.from && msg.chat?.id) {
      const telegramId = String(msg.from.id);
      try {
        await upsertTelegramUser(msg.from);
      } catch (err) {
        reqLogger.error({ err }, "upsertTelegramUser failed");
      }

      // Получаем state пользователя
      let userState: string | null = null;
      try {
        userState = await getTelegramUserState(telegramId);
      } catch (err) {
        reqLogger.error({ err }, "getTelegramUserState failed");
      }
      if (!userState) userState = "idle";

      const text = msg.text ?? "";


      // 1. /start — приветствие и главное меню
      if (text === "/start") {
        try {
          await setTelegramUserState(telegramId, "idle");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.welcome,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 4. "Задать вопрос" — выставить state, отправить инструкцию
      if (text === telegramContent.mainMenu.ask) {
        try {
          await setTelegramUserState(telegramId, "waiting_for_question");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.describeQuestion,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 5. Если state=waiting_for_question и приходит текст — переслать админу, очистить state, ответить пользователю
      if (userState === "waiting_for_question" && text) {
        try {
          await setTelegramUserState(telegramId, "idle");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        // Формируем сообщение админу
        const adminId = env.ADMIN_TELEGRAM_ID;
        if (adminId) {
          const from = msg.from;
          const userInfo = `От: ${from.first_name ?? ""} ${from.last_name ?? ""} @${from.username ?? ""}`.trim();
          const adminMsg = `Новый вопрос\n${userInfo}\nTelegram ID: ${telegramId}\nТекст:\n${text}`;
          try {
            await tgCall("sendMessage", {
              chat_id: adminId,
              text: adminMsg,
            });
          } catch (err) {
            reqLogger.error({ err }, "Telegram sendMessage to admin failed");
          }
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.questionAccepted,
            reply_markup: {
              keyboard: telegramContent.mainMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage to user failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 2. "Запись на приём" — показать меню (reply, не inline)
      if (text === telegramContent.mainMenu.book) {
        try {
          await setTelegramUserState(telegramId, "idle");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await sendMainMenu(msg.chat.id);
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMainMenu failed");
        }
        return reply.code(200).send({ ok: true });
      }


      // 3. "⚙️ Меню" — открыть moreMenu
      if (text === telegramContent.mainMenu.more) {
        try {
          await sendMoreMenu(msg.chat.id);
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMoreMenu failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // --- Второе меню ---
      // "⬅ Назад" — вернуться в главное меню
      if (text === telegramContent.moreMenu.back) {
        try {
          await sendMainMenu(msg.chat.id);
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMainMenu failed");
        }
        return reply.code(200).send({ ok: true });
      }
      // "🔔 Настройки уведомлений" — открыть экран или возврат через notify_back
      if (text === telegramContent.moreMenu.notifications) {
        try {
          let settings = await getNotificationSettings(Number(telegramId));
          if (!settings) settings = { notify_spb: false, notify_msk: false, notify_online: false };
          const kb = telegramContent.buildNotificationKeyboard(settings);
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: `${telegramContent.notificationSettings.title}\n\n${telegramContent.notificationSettings.subtitle}`,
            reply_markup: kb,
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }
          // --- Обработка callback_query для уведомлений ---
      // --- Обработка callback_query для уведомлений ---
      const cq = body.callback_query;
      if (cq?.from && cq.id && cq.data && cq.message?.chat?.id && cq.message?.message_id) {
        const telegramId = String(cq.from.id);
        let settings = await getNotificationSettings(Number(telegramId));
        if (!settings) settings = { notify_spb: false, notify_msk: false, notify_online: false };
        let updated = false;
        let newSettings = settings;
        if (cq.data === "notify_toggle_spb") {
          newSettings = { ...settings, notify_spb: !settings.notify_spb };
          try { await updateNotificationSettings(Number(telegramId), { notify_spb: newSettings.notify_spb }); } catch (err) { reqLogger.error({ err }, "updateNotificationSettings failed"); }
          updated = true;
        } else if (cq.data === "notify_toggle_msk") {
          newSettings = { ...settings, notify_msk: !settings.notify_msk };
          try { await updateNotificationSettings(Number(telegramId), { notify_msk: newSettings.notify_msk }); } catch (err) { reqLogger.error({ err }, "updateNotificationSettings failed"); }
          updated = true;
        } else if (cq.data === "notify_toggle_online") {
          newSettings = { ...settings, notify_online: !settings.notify_online };
          try { await updateNotificationSettings(Number(telegramId), { notify_online: newSettings.notify_online }); } catch (err) { reqLogger.error({ err }, "updateNotificationSettings failed"); }
          updated = true;
        } else if (cq.data === "notify_toggle_all") {
          const allTrue = settings.notify_spb && settings.notify_msk && settings.notify_online;
          newSettings = allTrue
            ? { notify_spb: false, notify_msk: false, notify_online: false }
            : { notify_spb: true, notify_msk: true, notify_online: true };
          try { await updateNotificationSettings(Number(telegramId), newSettings); } catch (err) { reqLogger.error({ err }, "updateNotificationSettings failed"); }
          updated = true;
        } else if (cq.data === "notify_back") {
          // Удалить inline-клавиатуру
          try {
            await tgCall("editMessageReplyMarkup", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              reply_markup: null,
            });
          } catch (err) {
            reqLogger.error({ err }, "Telegram editMessageReplyMarkup (remove inline) failed");
          }
          // Отправить обычное меню
          try {
            await tgCall("sendMessage", {
              chat_id: cq.message.chat.id,
              text: telegramContent.messages.chooseMenu,
              reply_markup: {
                keyboard: telegramContent.moreMenuKeyboard,
                resize_keyboard: true,
                one_time_keyboard: false,
              },
            });
          } catch (err) {
            reqLogger.error({ err }, "Telegram sendMessage (moreMenu) failed");
          }
          // Ответить на callback
          try { await tgCall("answerCallbackQuery", { callback_query_id: cq.id }); } catch (err) { reqLogger.error({ err }, "answerCallbackQuery failed"); }
          return reply.code(200).send({ ok: true });
        }
        if (updated) {
          // Перерисовать клавиатуру
          const kb = telegramContent.buildNotificationKeyboard(newSettings);
          try {
            await tgCall("editMessageReplyMarkup", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              reply_markup: kb,
            });
          } catch (err) {
            reqLogger.error({ err }, "Telegram editMessageReplyMarkup failed");
          }
          // Ответить на callback
          try { await tgCall("answerCallbackQuery", { callback_query_id: cq.id }); } catch (err) { reqLogger.error({ err }, "answerCallbackQuery failed"); }
          return reply.code(200).send({ ok: true });
        }
        // Если callback не из поддерживаемых — просто ответить 200 и answerCallbackQuery
        try { await tgCall("answerCallbackQuery", { callback_query_id: cq.id }); } catch (err) { reqLogger.error({ err }, "answerCallbackQuery failed"); }
        return reply.code(200).send({ ok: true });
      }
      // "📄 Мои записи" — заглушка
      if (text === telegramContent.moreMenu.myBookings) {
        // TODO: добавить реальную логику, пока только заглушка
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.noBookings,
            reply_markup: {
              keyboard: telegramContent.moreMenuKeyboard,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 6. Прочие тексты при state=idle — предложить выбрать действие (главное меню)
      if (userState === "idle") {
        try {
          await sendMainMenu(msg.chat.id);
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMainMenu failed");
        }
        return reply.code(200).send({ ok: true });
      }
    }

    return reply.code(200).send({ ok: true });
  });
}
