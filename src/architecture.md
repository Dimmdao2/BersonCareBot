# Пример архитектурных границ

// routes: только HTTP/Telegram вход
// services: бизнес-логика
// repositories: работа с БД
// worker: фоновые задачи
// config: env/infra

// Запретить прямые импорты:
// routes -> repositories
// worker -> routes

// Для усиления границ можно использовать eslint-boundaries или dependency-cruiser.

// ESLint: adapters не импортируют *persistence*; worker не импортирует *adapters* и *app* (eslint.config.mjs).

---

## Порты ядра (Фаза 1.1)

Ядро зависит только от абстрактных контрактов (портов), не от БД и не от Telegram.

- **UserPort** (core/ports/user.ts): upsertTelegramUser, setTelegramUserState, getTelegramUserState, tryAdvanceLastUpdateId, tryConsumeStart. Реализация: persistence/repositories/telegramUsers → services/telegramUserService.
- **NotificationsPort** (core/ports/notifications.ts): getNotificationSettings, updateNotificationSettings. Реализация: тот же репозиторий.
- **MessagingPort** (core/ports/messaging.ts): sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery. Реализация: adapters/telegram/client (grammy Bot.api).

Роут/адаптер передаёт порты в ядро; логика обработки — в ядре (1.2).

---

## Логика в ядре (Фаза 1.2)

Обработка апдейтов в core/messaging: handleMessage (handleStart, handleAsk, handleQuestion, handleBook, handleMore, handleDefaultIdle) и handleCallback (handleNotificationCallback, handleShowNotifications, handleMyBookings, handleBack). Контент передаётся адаптером как WebhookContent; ядро не импортирует content/. Адаптер создаёт MessagingPort (обёртка над tgCall), передаёт userPort и notificationsPort (telegramUserService) и вызывает хендлеры ядра.

---

## Репозитории как порты (Фаза 1.3)

persistence/repositories/telegramUsers экспортирует userPort: UserPort и notificationsPort: NotificationsPort — явные реализации контрактов ядра. services/telegramUserService реэкспортирует их; адаптер передаёт telegramUserService.userPort и telegramUserService.notificationsPort в ядро.

---

## REST-контракт (Фаза 1.4)

Типы ответов REST-эндпоинтов в adapters/rest/contract.ts. Сейчас один эндпоинт:

- **GET /health** — ответ 200, тело: `{ ok: true, db: 'up' | 'down' }` (HealthResponse). Реализация использует healthService.checkDb().

---

## Библиотека Telegram (Фаза 2)

Адаптер вызовов к Telegram Bot API переведён на [grammy](https://grammy.dev): adapters/telegram/client.ts создаёт Bot с `client: { fetch: globalThis.fetch }` и экспортирует createMessagingPort(), реализующую MessagingPort через bot.api (sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery). В E2E и юнит-тестах подменяется globalThis.fetch для перехвата вызовов к api.telegram.org. node-fetch остаётся в проекте только для worker.
