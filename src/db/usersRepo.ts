// src/routes/telegramWebhook.ts
import type { FastifyInstance } from "fastify";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { upsertTelegramUser } from "../db/telegramUsersRepo.js";
import { logger, getRequestLogger } from "../logger.js";
import { listTopicsWithUserState, toggleTopic } from "../services/subscriptionService.js";
import { buildSubscriptionsKeyboard } from "../telegram/subscriptionsKeyboard.js";
import type { TelegramWebhookBody, TelegramUserFrom } from "../types/telegram.js";

type TopicRow = {
  topic: {
    id: number;
    title: string;
  };
  enabled: boolean;
};

type ReplyKeyboardMarkup = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  one_time_keyboard: false;
};

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

function buildReplyMenu(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: "Подписки" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

async function tgCall(method: string, payload: Record<string, unknown>): Promise<void> {
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

function parseToggleTopicId(data: string): number | null {
  if (!data.startsWith("sub:toggle:")) return null;
  const parts = data.split(":");
  const raw = parts[2];
  if (typeof raw !== "string") return null;
  const topicId = Number(raw);
  if (!Number.isFinite(topicId)) return null;
  return topicId;
}

async function ensureTelegramUserId(from: TelegramUserFrom): Promise<number> {
  const row = await upsertTelegramUser(from);
  if (!row) throw new Error("upsertTelegramUser returned null");

  const idNum = Number(row.id);
  if (!Number.isSafeInteger(idNum)) {
    throw new Error(`telegram_users.id is not a safe integer: ${row.id}`);
  }
  return idNum;
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

    // 1) message handler
    const msg = body.message;
    if (msg?.from && typeof msg.chat?.id === "number") {
      const from = msg.from;

      try {
        await upsertTelegramUser(from);
      } catch (err) {
        reqLogger.error({ err }, "upsertTelegramUser failed");
      }

      const text = msg.text ?? "";

      if (text === "/start") {
        await tgCall("sendMessage", {
          chat_id: msg.chat.id,
          text: "Готово.",
          reply_markup: buildReplyMenu(),
        });

        return reply.code(200).send({ ok: true });
      }

      if (text === "Подписки") {
        const userId = await ensureTelegramUserId(from);
        const rows: TopicRow[] = await listTopicsWithUserState(userId);

        const kb: InlineKeyboardMarkup = buildSubscriptionsKeyboard(
          rows.map((row: TopicRow) => ({
            topicId: row.topic.id,
            title: row.topic.title,
            enabled: row.enabled,
          }))
        );

        await tgCall("sendMessage", {
          chat_id: msg.chat.id,
          text: "Подписки:",
          reply_markup: kb,
        });

        return reply.code(200).send({ ok: true });
      }
    }

    // 2) callback_query handler
    const cq = body.callback_query;
    if (cq?.from && cq.id) {
      const data = cq.data ?? "";
      const topicId = parseToggleTopicId(data);

      if (topicId !== null) {
        const userId = await ensureTelegramUserId(cq.from);
        await toggleTopic(userId, topicId);

        const rows: TopicRow[] = await listTopicsWithUserState(userId);
        const kb: InlineKeyboardMarkup = buildSubscriptionsKeyboard(
          rows.map((row: TopicRow) => ({
            topicId: row.topic.id,
            title: row.topic.title,
            enabled: row.enabled,
          }))
        );

        const chatId = cq.message?.chat?.id;
        const messageId = cq.message?.message_id;

        if (typeof chatId === "number" && typeof messageId === "number") {
          await tgCall("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: "Подписки:",
            reply_markup: kb,
          });
        }

        await tgCall("answerCallbackQuery", { callback_query_id: cq.id });

        return reply.code(200).send({ ok: true });
      }
    }

    return reply.code(200).send({ ok: true });
  });
}