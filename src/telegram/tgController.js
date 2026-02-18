const { tg } = require("./tgApi");
const { contactKeyboard } = require("./tgKeyboards");
const { ADMIN_CHAT_ID, TG_BOT_TOKEN, TG_WEBHOOK_SECRET } = require("../config");
const { bindPhoneToChat, getPhoneByChatId } = require("../storage/bindingsRepo");

function isTelegramUpdate(body) {
  return body && typeof body === "object" && typeof body.update_id === "number";
}

function getHeader(headers, nameLower) {
  if (!headers) return undefined;
  // у CF заголовки могут приходить в любом регистре
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === nameLower) return v;
  }
  return undefined;
}

function formatUnknownToAdmin({ fromName, fromUsername, fromPhone, text }) {
  return [
    `имя отправителя: ${fromName || "-"}`,
    `ник отправителя: ${fromUsername ? `@${fromUsername}` : "-"}`,
    `телефон отправителя: ${fromPhone || "-"}`,
    `сообщение: ${text || "-"}`,
  ].join("\n");
}

async function handleTelegram(event, body) {
  const token = TG_BOT_TOKEN();
  const secret = TG_WEBHOOK_SECRET();

  const headerSecret = getHeader(event.headers, "x-telegram-bot-api-secret-token");
  if (secret && headerSecret !== secret) {
    return { statusCode: 403, body: "forbidden" };
  }

  const message = body.message;
  if (!message) return { statusCode: 200, body: "ok" };

  const chatId = message.chat?.id;
  if (typeof chatId !== "number") return { statusCode: 200, body: "ok" };

  const fromName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim();
  const fromUsername = message.from?.username || "";
  const text = typeof message.text === "string" ? message.text.trim() : "";

  // /start -> предложить кнопку контакта
  if (text === "/start") {
    await tg("sendMessage", token, {
      chat_id: chatId,
      text: "Нажми кнопку ниже, чтобы поделиться номером телефона.",
      reply_markup: contactKeyboard(),
    });
    return { statusCode: 200, body: "ok" };
  }

  // /phone +7999...
  if (text.toLowerCase().startsWith("/phone")) {
    const parts = text.split(/\s+/).filter(Boolean);
    const phoneRaw = parts[1] || "";
    const bound = bindPhoneToChat(chatId, phoneRaw);

    await tg("sendMessage", token, {
      chat_id: chatId,
      text: bound.ok ? `Телефон сохранён: ${bound.phone}` : "Не распознал телефон. Формат: /phone +79990000000",
    });

    return { statusCode: 200, body: "ok" };
  }

  // Контакт
  if (message.contact && typeof message.contact.phone_number === "string") {
    const bound = bindPhoneToChat(chatId, message.contact.phone_number);

    await tg("sendMessage", token, {
      chat_id: chatId,
      text: bound.ok ? `Телефон сохранён: ${bound.phone}` : "Не смог сохранить телефон из контакта.",
    });

    return { statusCode: 200, body: "ok" };
  }

  // Нераспознанное -> админу
  const fromPhone = getPhoneByChatId(chatId);
  await tg("sendMessage", token, {
    chat_id: ADMIN_CHAT_ID,
    text: formatUnknownToAdmin({
      fromName,
      fromUsername,
      fromPhone,
      text: text || "[не текстовое сообщение]",
    }),
  });

  return { statusCode: 200, body: "ok" };
}

module.exports = { isTelegramUpdate, handleTelegram };
