type TopicRow = {
  topic: {
    id: number;
    title: string;
  };
  enabled: boolean;
};
import { FastifyInstance } from "fastify";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { upsertUser } from "../db/usersRepo.js";
import { upsertTelegramUser } from "../db/telegramUsersRepo.js";
import { logger, getRequestLogger } from "../logger.js";
import { listTopicsWithUserState, toggleTopic } from "../services/subscriptionService.js";
import { buildSubscriptionsKeyboard } from "../telegram/subscriptionsKeyboard.js";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  language_code?: string;
  is_bot?: boolean;
};

type TelegramChat = { id: number };

type TelegramMessage = {
  message_id?: number;
  text?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

type TelegramWebhookBody = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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

async function ensureUserIdFromTelegram(user: TelegramUser): Promise<number> {
  const upserted = await upsertUser({
    telegram_id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    _language_code: user.language_code,
  });

  return upserted.id;
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

export async function telegramWebhookRoutes(app: FastifyInstance) {
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
    if (msg?.from && msg.chat?.id) {
      // Step 1: persist telegram user
      try {
        await upsertTelegramUser(msg.from);
      } catch (err) {
        reqLogger.error({ err }, 'upsertTelegramUser failed');
        // Do not throw, always return ok
      }

      const text = msg.text ?? "";

      if (text === "/start") {
        const userId = await ensureUserIdFromTelegram(msg.from);

        reqLogger.info(
          {
            event: "/start",
            update_id: body.update_id,
            user_id: userId,
            chat_id: msg.chat.id,
            telegram_id: msg.from.id,
            username: msg.from.username,
            first_name: msg.from.first_name,
            last_name: msg.from.last_name,
            language_code: msg.from.language_code,
          },
          "/start user upserted",
        );

        await tgCall("sendMessage", {
          chat_id: msg.chat.id,
          text: "Готово.",
          reply_markup: buildReplyMenu(),
        });

        return reply.code(200).send({ ok: true });
      }

      if (text === "Подписки") {
        const userId = await ensureUserIdFromTelegram(msg.from);
        const rows: TopicRow[] = await listTopicsWithUserState(userId);

        const kb: InlineKeyboardMarkup = buildSubscriptionsKeyboard(
          rows.map((row: TopicRow) => ({
            topicId: row.topic.id,
            title: row.topic.title,
            enabled: row.enabled,
          })),
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
        const userId = await ensureUserIdFromTelegram(cq.from);
        await toggleTopic(userId, topicId);

        const rows: TopicRow[] = await listTopicsWithUserState(userId);
        const kb: InlineKeyboardMarkup = buildSubscriptionsKeyboard(
          rows.map((row: TopicRow) => ({
            topicId: row.topic.id,
            title: row.topic.title,
            enabled: row.enabled,
          })),
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

        await tgCall("answerCallbackQuery", {
          callback_query_id: cq.id,
        });

        return reply.code(200).send({ ok: true });
      }
    }

    return reply.code(200).send({ ok: true });
  });
}