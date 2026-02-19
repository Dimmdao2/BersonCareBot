// src/routes/telegramWebhook.ts
import type { FastifyInstance } from "fastify";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { upsertTelegramUser, setTelegramUserState, getTelegramUserState } from "../db/telegramUsersRepo.js";
import { logger, getRequestLogger } from "../logger.js";
import { telegramContent } from "../content/index.js";

import type { TelegramWebhookBody } from "../types/telegram.js";

type ReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  one_time_keyboard: false;
};

function buildReplyMenu(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [
        { text: telegramContent.menu.book },
        { text: telegramContent.menu.notifications },
        { text: telegramContent.menu.question }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
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
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 4. "Задать вопрос" — выставить state, отправить инструкцию
      if (text === telegramContent.menu.question) {
        try {
          await setTelegramUserState(telegramId, "waiting_for_question");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.describeQuestion,
            reply_markup: buildReplyMenu(),
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
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage to user failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 2. "Запись на приём" — показать меню (reply, не inline)
      if (text === telegramContent.menu.book) {
        try {
          await setTelegramUserState(telegramId, "idle");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.chooseMenu,
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 3. "Настройки уведомлений" — заглушка
      if (text === telegramContent.menu.notifications) {
        try {
          await setTelegramUserState(telegramId, "idle");
        } catch (err) {
          reqLogger.error({ err }, "setTelegramUserState failed");
        }
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.notImplemented,
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }

      // 6. Прочие тексты при state=idle — предложить выбрать действие
      if (userState === "idle") {
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: telegramContent.messages.chooseMenu,
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }
        return reply.code(200).send({ ok: true });
      }
    }

    return reply.code(200).send({ ok: true });
  });
}
