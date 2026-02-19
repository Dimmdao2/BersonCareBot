// src/routes/telegramWebhook.ts
import type { FastifyInstance } from "fastify";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { upsertTelegramUser } from "../db/telegramUsersRepo.js";
import { logger, getRequestLogger } from "../logger.js";

import type { TelegramWebhookBody } from "../types/telegram.js";

type ReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  one_time_keyboard: false;
};

function buildReplyMenu(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: "Подписки" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

const IS_TEST =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  process.env.CI === "true";

const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

async function tgCall(method: string, payload: Record<string, unknown>): Promise<void> {
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
      try {
        await upsertTelegramUser(msg.from);
      } catch (err) {
        reqLogger.error({ err }, "upsertTelegramUser failed");
      }

      const text = msg.text ?? "";

      if (text === "/start") {
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: "Готово.",
            reply_markup: buildReplyMenu(),
          });
        } catch (err) {
          reqLogger.error({ err }, "Telegram sendMessage failed");
        }

        return reply.code(200).send({ ok: true });
      }

      if (text === "Подписки") {
        try {
          await tgCall("sendMessage", {
            chat_id: msg.chat.id,
            text: "Подписки:",
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
