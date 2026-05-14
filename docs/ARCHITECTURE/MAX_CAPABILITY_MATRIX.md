# MAX vs Telegram — capability matrix

This document records which Telegram mechanics are **fully supported**, **partially supported**, or **not supported** in the MAX integration, and the chosen fallback where applicable.

Reference: [MAX API docs](https://dev.max.ru/docs-api), [Telegram Bot API](https://core.telegram.org/bots/api).

## Incoming / Ignored updates (MAX webhook)

Типы из `MaxUpdateSchema` (`schema.ts`), для которых `fromMax` возвращает **`null`** (нет `IncomingUpdate`): `message_removed`, `message_edited`, `bot_added`, `bot_removed`, `user_removed`, `chat_title_changed`, `message_construction_request`, `message_constructed`, `message_chat_created`. Обработчик webhook отвечает клиенту **ok** и пишет в `reqLogger.info` **точное** сообщение лога `max webhook skipped (unsupported or missing chatId/userId)` — это полная строка для поиска в логах/дашбордах (см. `webhook.ts`).

## Incoming

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Text message | full | full | `message_created` with `message.text` mapped to `message.received`. |
| Reply context (`reply_to` / link) | full | full | MAX: `message.link` с `type: "reply"` → `replyToMessageId` на `message_created` и на **`message_callback`** (если в `message` есть `link`); для free-text skip см. reminders. |
| Callback (button press) | full | full | `message_callback`: `callback_id`, `payload` → `callback.received`; при наличии `message.link` (reply) дополнительно прокидывается `replyToMessageId`. |
| Contact request | full | partial | MAX: `message_created` с вложением `type: "contact"` (`phone` / `phone_number`) → `IncomingMessageUpdate.phone` и `relayMessageType: "contact"` (см. unit-тесты `mapIn.test.ts`). Кнопка `request_contact` в outbox — отдельный UX-путь; контракт входящего контакта покрыт тестами, не требует ручной прод-проверки в рамках матрицы. |
| /start, bot_started | full | full | `bot_started` and `/start` text both open start flow (`max.start` / onboarding). |
| Slash commands in bot menu | full (Telegram menu button / text) | partial | MAX `setMyCommands`: **пустой список** (на старте webhook в [`setupCommands.ts`](../../apps/integrator/src/integrations/max/setupCommands.ts)); главное меню — инлайн-кнопки. Текстовые **`/book`**, **`/diary`**, **`/menu`** по-прежнему обрабатываются в [`mapIn.ts`](../../apps/integrator/src/integrations/max/mapIn.ts) (`booking.open`, `nav.webapp.diary`, `nav.webapp.menu`) — это независимо от списка команд в UI. |
| Reply keyboard (persistent bottom buttons) | full | unsupported | MAX uses inline keyboard only; we use inline menu as fallback. |

## Outgoing

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Send text | full | full | POST `/messages?user_id=`. |
| Send with inline keyboard | full | full | `attachments` with `inline_keyboard`: `callback`, `link`, `request_contact`, **`open_app`**. |
| Edit message text | full | full | PUT `/messages?message_id=` (MAX allows edit within 24h). |
| Delete message | full | full | DELETE `/messages?message_id=` — best-effort удаление «зависшего» reminder перед повторной отправкой (как у Telegram); ошибки delete не блокируют send. Пустой/невалидный `message_id` в интенте delete → no-op в адаптере (`max_reminder_delete_payload_invalid`), без исключения. |
| Edit message reply markup | full | full | Same PUT with `attachments` (inline keyboard). |
| Answer callback | full | full | POST `/answers` with `callback_id`. |
| Reply keyboard (persistent) | full | unsupported | Fallback: use inline keyboard for menu. |
| Parse mode (HTML/Markdown) | full | full | MAX supports `format: "html"` / `"markdown"` in NewMessageBody. |

## Notifications

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Bot-initiated message to user | full | full | Same POST `/messages` by `user_id`. |
| Notifications via platform | full | full | Delivered as normal messages. |

## Web App / deep links

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Open Web App (Mini App) | full | full | Оркестратор собирает Telegram-style `web_app: { url }` из фактов (`links.webapp*Url`). [`deliveryAdapter`](../../apps/integrator/src/integrations/max/deliveryAdapter.ts) отправляет в MAX API кнопку **`type: open_app`** с полем **`web_app`** (URL мини-приложения), опционально **`contact_id`**: сначала числовой **`recipient.chatId`** (адресат этого сообщения; совпадает с user id в личке), иначе **`meta.userId`** — так корректно и при fan-out с другого источника (например rubitime), и когда meta пустой. Мини-приложение открывается **в клиенте MAX** с MAX Bridge (`initData`). Строки **`keyboard`** (reply keyboard) сливаются с **`inline_keyboard`** в одно вложение. Обычные URL без `web_app` остаются **`link`** (внешняя вкладка). См. [документацию MAX](https://dev.max.ru/docs-api) — типы кнопок, [MAX Bridge](https://dev.max.ru/docs/webapps/bridge). |
| Deep link with start param | full | full | `link_*`, `setphone_*`, `setrubitimerecord_*`, `noticeme`, `start.set*` — тот же разбор, что в Telegram, через [`messengerStartParse`](../../apps/integrator/src/integrations/common/messengerStartParse.ts) в [`fromMax`](../../apps/integrator/src/integrations/max/mapIn.ts); payload `bot_started` без префикса `/start` канонизируется. |

## Webhook and dev workflow

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Webhook (HTTPS) | full | full | POST `/webhook/max`, secret in `X-Max-Bot-Api-Secret`. |
| Long polling | supported | full | GET `/updates` for dev when webhook not set. |
| **Production blocker** | — | HTTPS only, port 443 | MAX does not deliver to HTTP or non-443. Use public HTTPS URL or long-poll for dev. |

## Summary

- **Fully supported in MAX for MVP:** receive text/callback, send text, inline keyboard, edit message, answer callback, HTML/Markdown.
- **Авто-главное меню (executor):** к `message.send` / `message.compose` в канал MAX подмешивается строка `menus.main` только при **`linkedPhone`**, числовом **`recipient.chatId`**, отсутствии своей `replyMarkup` и доставке в max (в т.ч. отдельный интент при Rubitime fan-out). Без `chatId` меню не подмешивается — иначе отправка в MAX невозможна. См. `delivery.ts`, `INTEGRATOR_CONTRACT.md`.
- **Partial:** contact request **кнопка** vs полный UX Telegram; входящий контакт в сообщении — см. строку Contact request выше.
- **Unsupported (with fallback):** reply keyboard → use inline keyboard for main menu.
