// src/index.js
/**
 * Cloud Function entrypoint.
 *
 * Задача файла:
 * - принять входящий webhook (Telegram или Rubitime);
 * - безопасно распарсить JSON;
 * - определить источник по форме payload;
 * - передать управление соответствующему контроллеру;
 * - всегда вернуть корректный HTTP-ответ (для вебхуков критично быстро отвечать).
 *
 * ВАЖНО:
 * - неизвестные payload не считаем ошибкой: логируем и отвечаем 200 OK,
 *   чтобы внешние сервисы не ретраили запрос бесконечно.
 */

const { isTelegramUpdate, handleTelegram } = require("./telegram/tgController");
const { isRubitimeWebhook, handleRubitime } = require("./rubitime/rubiController");

/** Унифицированный текстовый ответ */
function reply(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body,
  };
}

/** Безопасный JSON.parse */
function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, value: null };
  }
}

module.exports.handler = async function (event) {
  // event.body может прийти как строка или как объект (зависит от источника/тестера)
  const rawBody =
    typeof event.body === "string"
      ? event.body
      : JSON.stringify(event.body || {});

  const parsed = safeJsonParse(rawBody || "{}");
  if (!parsed.ok) return reply(400, "invalid json");

  const body = parsed.value;

  return reply(r.statusCode, r.body)
  
  // Telegram webhook (update_id)
  if (isTelegramUpdate(body)) {
    const r = await handleTelegram(event, body);
    return reply(r.statusCode, r.body);
  }

  // Rubitime webhook (event-create/update/remove-record)
  if (isRubitimeWebhook(body)) {
    const r = await handleRubitime(body);
    return reply(r.statusCode, r.body);
  }

  // Неизвестный webhook: логируем для диагностики и подтверждаем приём
  console.log("Unknown webhook payload:", body);
  return reply(200, "ok");
};