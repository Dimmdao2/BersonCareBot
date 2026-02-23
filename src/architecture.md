# Архитектура BersonCareBot

Документ описывает слои, структуру папок и поток данных. Прочитав его, можно составить полное представление о внутреннем устройстве приложения.

---

## Слои и зависимости

- **domain** — доменная логика и контракты (типы, порты, usecases). Не импортирует channels, db, content, observability, app.
- **channels** — двунаправленные адаптеры мессенджеров (вход + выход). Сейчас: Telegram (webhook, mapIn, mapOut, client). Не импортирует db.
- **db** — PostgreSQL: клиент, миграции, репозитории. Реализует порты domain (UserPort, NotificationsPort).
- **app** — сборка Fastify (server, routes, di), регистрация health и webhook. Composition root в di.ts.
- **config** — единственный источник env (zod, один раз при старте).
- **content** — тексты и клавиатуры; передаются в ядро через тип WebhookContent. Domain не импортирует content напрямую — только через тип/порт.
- **observability** — логирование (Pino), задел под метрики/трейсинг. Без бизнес-логики.
- **integrations** — внешние вебхуки и системы (Rubitime, Tilda и т.п.); пока заглушка.
- **worker** — фоновые задачи (рассылки). Использует db и config; не импортирует channels и app.

**Правила (ESLint):** channels не импортируют `*db*`; domain не импортирует `*channels*`, `*db*`, `*adapters*`, `*persistence*`; worker не импортирует `*channels*`, `*app*`.

---

## Структура каталогов и файлов

```
src/
├── main.ts                      # Точка входа: dotenv → buildApp → listen
├── app.ts                       # Реэкспорт buildApp из app/server.js
├── app/
│   ├── server.ts                # Сборка Fastify, registerRoutes(app, deps)
│   ├── routes.ts                # GET /health, регистрация telegramWebhookRoutes; HealthResponse
│   ├── di.ts                    # Composition root: healthCheckDb, userPort, notificationsPort из db
│   └── health.test.ts
├── config/
│   └── env.ts                   # Валидация process.env (zod)
├── content/
│   ├── README.md                # Правило: domain не импортирует content напрямую
│   ├── index.ts                 # Реэкспорт telegramContent
│   └── telegram.ts              # Тексты и клавиатуры для Telegram (WebhookContent)
├── domain/
│   ├── types.ts                 # TelegramUserFrom, IncomingUpdate, OutgoingAction и др.
│   ├── webhookContent.ts        # Тип WebhookContent (контракт контента для ядра)
│   ├── ports/
│   │   ├── index.ts             # Реэкспорт портов
│   │   ├── user.ts              # UserPort
│   │   ├── notifications.ts     # NotificationsPort
│   │   └── messaging.ts         # MessagingPort (опционально; основной поток — OutgoingAction[])
│   └── usecases/
│       ├── index.ts             # Экспорт handleUpdate и всех handle*
│       ├── handleUpdate.ts      # IncomingUpdate → OutgoingAction[]
│       ├── handleMessage.ts     # handleStart, handleAsk, handleQuestion, handleBook, handleMore, handleDefaultIdle
│       ├── handleCallback.ts    # handleNotificationCallback, handleShowNotifications, handleMyBookings, handleBack
│       ├── notifications.ts     # getSettings, updateSettings (используют NotificationsPort)
│       └── onboarding.ts       # tryConsumeStart, upsertUser (используют UserPort)
├── channels/
│   └── telegram/
│       ├── schema.ts            # TelegramWebhookBodySchema, parseWebhookBody (Zod)
│       ├── mapIn.ts             # fromTelegram(body, context) → IncomingUpdate | null
│       ├── mapOut.ts            # toTelegram(actions, api), TelegramApi
│       ├── client.ts            # Bot (grammY), getBotInstance(), createMessagingPort()
│       ├── webhook.ts           # POST /webhook/telegram: секрет, валидация, дедуп, fromTelegram → handleUpdate → toTelegram
│       ├── webhook.test.ts
│       └── webhook.mocked.test.ts
├── db/
│   ├── client.ts                # Единый пул pg (env.DATABASE_URL), healthCheckDb
│   ├── migrate.ts               # Применение миграций из migrations/
│   └── repos/
│       ├── telegramUsers.ts     # userPort, notificationsPort; работа с telegram_users
│       ├── topics.ts            # mailing_topics
│       └── subscriptions.ts    # user_subscriptions
├── worker/
│   └── mailingWorker.ts         # Рассылки; использует db/client
├── observability/
│   ├── README.md                # Текущий статус (Pino), планы (OTel, metrics, tracing)
│   └── logger.ts                # Pino, getRequestLogger, getWorkerLogger, getMigrationLogger
├── integrations/
│   └── README.md                # Заглушка под Rubitime, Tilda и т.п.
└── architecture.md             # Этот документ
```

Корень репозитория:

```
migrations/          # SQL-миграции (001_*.sql … 008_worker_schema.sql)
e2e/                 # Сценарии webhook (Vitest), fixtures/telegram/*.json
admin/               # SPA Admin UI (Vite + React), сборка → admin/dist
```

---

## Поток данных: webhook Telegram

1. **app/routes.ts** регистрирует **channels/telegram/webhook.ts** с deps из **app/di.ts** (userPort, notificationsPort из db/repos).

2. **channels/telegram/webhook.ts**  
   Проверка заголовка `x-telegram-bot-api-secret-token` (если задан `TG_WEBHOOK_SECRET`).  
   Валидация body через **parseWebhookBody** (schema.ts) → при ошибке 400.  
   Upsert пользователя, дедупликация по `update_id` (userPort.tryAdvanceLastUpdateId).  
   Сбор контекста (userState, adminForward для сообщений).

3. **channels/telegram/mapIn.ts**  
   **fromTelegram**(body, context) → `IncomingUpdate | null` (message или callback в едином формате).

4. **domain/usecases/handleUpdate.ts**  
   **handleUpdate**(incoming, userPort, notificationsPort, content) → `OutgoingAction[]`.  
   Ветвление по `incoming.kind` и тексту/callback_data; вызов handleStart, handleAsk, handleNotificationCallback и т.д. Ядро только возвращает действия, не вызывает Telegram.

5. **channels/telegram/mapOut.ts**  
   **toTelegram**(actions, getBotInstance().api) — последовательное выполнение sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery через grammY.

6. Ответ 200 (всегда, чтобы Telegram не повторял доставку).

Секрет и дедупликация — в канале (webhook), до вызова ядра. Валидация body — в канале; в ядро попадает только провалидированный внутренний тип.

---

## Поток данных: health

**app/routes.ts** — GET /health вызывает **deps.healthCheckDb()** (из app/di.ts → db/client.healthCheckDb). Ответ по контракту **HealthResponse**: `{ ok: true, db: 'up' | 'down' }`.

---

## Порты domain и реализации

| Порт | Описание | Реализация |
|------|----------|------------|
| **UserPort** | upsertTelegramUser, setTelegramUserState, getTelegramUserState, tryAdvanceLastUpdateId, tryConsumeStart | db/repos/telegramUsers |
| **NotificationsPort** | getNotificationSettings, updateNotificationSettings | тот же репозиторий |
| **MessagingPort** | sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery | channels/telegram/client (createMessagingPort). В основном потоке ядро возвращает OutgoingAction[], канал выполняет их через toTelegram. |

---

## Внутренний формат (domain без Telegram)

- **domain/types.ts:**  
  **IncomingUpdate** = IncomingMessageUpdate | IncomingCallbackUpdate (kind, chatId, telegramId, text/callbackData и т.д.).  
  **OutgoingAction** = SendMessageAction | EditMessageTextAction | EditMessageReplyMarkupAction | AnswerCallbackQueryAction (поля без привязки к API Telegram).

Контент (тексты, клавиатуры) в ядро передаётся типом **WebhookContent** (domain/webhookContent.ts); реализацию поставляет канал (content/telegram). Domain не импортирует content напрямую.

---

## Telegram API

**channels/telegram/client.ts:** grammY Bot, `client: { fetch: globalThis.fetch }`. Экспорт **getBotInstance()** для toTelegram; **createMessagingPort()** — опционально. В тестах и E2E подменяется `globalThis.fetch` для мока вызовов к api.telegram.org.

---

## Воркер и БД

**worker/mailingWorker.ts** — рассылки по таблицам telegram_users (is_active), mailing_topics, user_subscriptions, mailings, mailing_logs. Использует **db/client**. Миграция **008_worker_schema.sql** вносит таблицы и поля, нужные воркеру.

---

## Admin UI

Папка **admin/** в корне — SPA (Vite + React), сборка в **admin/dist**. Nginx для admin.bersonservices.ru отдаёт статику из DEPLOY_PATH/admin/dist. Admin API будет на tgcarebot.bersonservices.ru по путям /admin/api/* (в рамках текущего Fastify).
