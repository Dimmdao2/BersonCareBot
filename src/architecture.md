# Архитектура BersonCareBot

Документ описывает слои, структуру папок и поток данных. Прочитав его, можно составить полное представление о внутреннем устройстве приложения.

---

## Слои и зависимости

- **core** — доменная логика и контракты (порты). Не импортирует adapters, persistence, content.
- **adapters** — HTTP/Telegram вход: валидация, маппинг в/из внутреннего формата, вызов ядра. Не импортирует persistence.
- **persistence** — БД (клиент, миграции, репозитории). Реализует порты ядра.
- **services** — фасады над persistence для адаптеров (реэкспорт портов и при необходимости оркестрация).
- **config** — единственный источник env (zod, один раз при старте).
- **content** — тексты и клавиатуры (передаются в ядро через WebhookContent, ядро content не импортирует).
- **worker** — фоновые задачи (рассылки). Использует persistence и config; не импортирует adapters и app.

**Правила (ESLint):** adapters не импортируют `*persistence*`; worker не импортирует `*adapters*`, `*app*`; core не импортирует `*adapters*`, `*persistence*`.

---

## Структура каталогов и файлов

```
src/
├── main.ts                    # Точка входа: dotenv → buildApp → listen
├── app.ts                     # Сборка Fastify: регистрация роутов (health, webhook)
├── logger.ts                  # Pino, getRequestLogger, getWorkerLogger

├── config/
│   └── env.ts                 # Валидация process.env (zod), единственный источник env

├── content/
│   ├── index.ts               # Реэкспорт
│   └── telegram.ts            # Тексты и клавиатуры для Telegram (WebhookContent)

├── core/
│   ├── types.ts               # TelegramUserFrom, IncomingUpdate, OutgoingAction и др.
│   ├── webhookContent.ts      # Тип WebhookContent (контракт контента для ядра)
│   ├── ports/
│   │   ├── index.ts           # Реэкспорт портов
│   │   ├── user.ts            # UserPort
│   │   ├── notifications.ts   # NotificationsPort
│   │   └── messaging.ts      # MessagingPort (используется опционально; основной поток — действия)
│   ├── messaging/
│   │   ├── index.ts           # Экспорт handleUpdate и всех handle*
│   │   ├── handleUpdate.ts    # Единая точка: IncomingUpdate → OutgoingAction[]
│   │   ├── handleMessage.ts   # handleStart, handleAsk, handleQuestion, handleBook, handleMore, handleDefaultIdle
│   │   └── handleCallback.ts  # handleNotificationCallback, handleShowNotifications, handleMyBookings, handleBack
│   ├── notifications/
│   │   └── service.ts         # getSettings, updateSettings (используют NotificationsPort)
│   └── onboarding/
│       └── service.ts         # tryConsumeStart, upsertUser (используют UserPort)

├── adapters/
│   ├── rest/
│   │   ├── contract.ts        # HealthResponse и типы ответов REST
│   │   ├── health.ts          # GET /health → healthService.checkDb()
│   │   └── health.test.ts
│   └── telegram/
│       ├── schema.ts         # TelegramWebhookBodySchema, parseWebhookBody (Zod)
│       ├── mapper.ts          # fromTelegram(body, context) → IncomingUpdate; toTelegram(actions, api)
│       ├── client.ts         # Bot (grammy), getBotInstance(), createMessagingPort()
│       ├── webhook.ts        # POST /webhook/telegram: секрет, валидация, дедуп, fromTelegram → handleUpdate → toTelegram
│       ├── webhook.test.ts
│       └── webhook.mocked.test.ts

├── services/
│   ├── telegramUserService.ts # Реэкспорт userPort, notificationsPort из persistence
│   ├── healthService.ts       # checkDb() → persistence/client.healthCheckDb
│   └── subscriptionService.ts # Подписки (topics, user_subscriptions) — для будущего/воркера

├── persistence/
│   ├── client.ts             # Единый пул pg (env.DATABASE_URL), healthCheckDb
│   ├── migrate.ts            # Применение миграций из migrations/
│   └── repositories/
│       ├── telegramUsers.ts  # userPort, notificationsPort; работа с telegram_users
│       ├── topics.ts         # mailing_topics
│       └── subscriptions.ts  # user_subscriptions

└── worker/
    └── mailingWorker.ts      # Рассылки: mailings, mailing_logs, telegram_users (общий пул из persistence/client)
```

Корень репозитория:

```
migrations/          # SQL-миграции (001_*.sql … 008_worker_schema.sql)
e2e/                 # Сценарии webhook (Vitest + run-webhook-scenarios.ts), fixtures/telegram/*.json
```

---

## Поток данных: webhook Telegram

1. **adapters/telegram/webhook.ts**  
   Проверка заголовка `x-telegram-bot-api-secret-token` (если задан `TG_WEBHOOK_SECRET`).  
   Валидация body через **parseWebhookBody** (schema.ts) → при ошибке 400.  
   Upsert пользователя, дедупликация по `update_id` (userPort.tryAdvanceLastUpdateId).  
   Сбор контекста (userState, adminForward для сообщений).

2. **adapters/telegram/mapper.ts**  
   **fromTelegram**(body, context) → `IncomingUpdate | null` (message или callback в едином формате).

3. **core/messaging/handleUpdate.ts**  
   **handleUpdate**(incoming, userPort, notificationsPort, content) → `OutgoingAction[]`.  
   Ветвление по `incoming.kind` и тексту/callback_data; вызов handleStart, handleAsk, handleNotificationCallback и т.д. Ядро только возвращает действия, не вызывает Telegram.

4. **adapters/telegram/mapper.ts**  
   **toTelegram**(actions, getBotInstance().api) — последовательное выполнение sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery через grammY.

5. Ответ 200 (всегда, чтобы Telegram не повторял доставку).

Секрет и дедупликация — в адаптере (webhook), до вызова ядра. Валидация body — в адаптере; в ядро попадает только провалидированный внутренний тип.

---

## Поток данных: health

**adapters/rest/health.ts** → **services/healthService.checkDb()** → **persistence/client.healthCheckDb()**. Ответ по контракту **HealthResponse** (contract.ts): `{ ok: true, db: 'up' | 'down' }`.

---

## Порты ядра и реализации

| Порт | Описание | Реализация |
|------|----------|------------|
| **UserPort** | upsertTelegramUser, setTelegramUserState, getTelegramUserState, tryAdvanceLastUpdateId, tryConsumeStart | persistence/repositories/telegramUsers → services/telegramUserService |
| **NotificationsPort** | getNotificationSettings, updateNotificationSettings | тот же репозиторий |
| **MessagingPort** | sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery | adapters/telegram/client (createMessagingPort). В основном потоке ядро возвращает OutgoingAction[], адаптер выполняет их через toTelegram. |

---

## Внутренний формат (ядро без Telegram)

- **core/types.ts:**  
  **IncomingUpdate** = IncomingMessageUpdate | IncomingCallbackUpdate (kind, chatId, telegramId, text/callbackData и т.д.).  
  **OutgoingAction** = SendMessageAction | EditMessageTextAction | EditMessageReplyMarkupAction | AnswerCallbackQueryAction (поля без привязки к API Telegram).

Контент (тексты, клавиатуры) в ядро передаётся типом **WebhookContent** (core/webhookContent.ts); реализацию поставляет адаптер (content/telegram).

---

## Telegram API

**adapters/telegram/client.ts:** grammY Bot, `client: { fetch: globalThis.fetch }`. Экспорт **getBotInstance()** для toTelegram; **createMessagingPort()** — опционально. В тестах и E2E подменяется `globalThis.fetch` для мока вызовов к api.telegram.org.

---

## Воркер и БД

**worker/mailingWorker.ts** — рассылки по таблицам telegram_users (is_active), mailing_topics, user_subscriptions, mailings, mailing_logs. Использует общий пул **persistence/client**. Точка входа для запуска как скрипта — ESM (import.meta / путь). Миграция **008_worker_schema.sql** вносит таблицы и поля, нужные воркеру.
