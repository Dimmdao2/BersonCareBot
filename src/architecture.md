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

// TODO: добавить правила ESLint для архитектурных границ

---

## Порты ядра (Фаза 1.1)

Ядро зависит только от абстрактных контрактов (портов), не от БД и не от Telegram.

- **UserPort** (core/ports/user.ts): upsertTelegramUser, setTelegramUserState, getTelegramUserState, tryAdvanceLastUpdateId, tryConsumeStart. Реализация: persistence/repositories/telegramUsers → services/telegramUserService.
- **NotificationsPort** (core/ports/notifications.ts): getNotificationSettings, updateNotificationSettings. Реализация: тот же репозиторий.
- **MessagingPort** (core/ports/messaging.ts): sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery. Реализация: adapters/telegram/client (tgCall).

Роут/адаптер пока может вызывать сервисы напрямую; при выносе логики в ядро (1.2) ядро будет получать порты снаружи (DI).
