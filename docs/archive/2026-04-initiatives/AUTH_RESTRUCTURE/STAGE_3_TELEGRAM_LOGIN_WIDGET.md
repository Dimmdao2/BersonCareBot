# Stage 3 - Telegram Login Widget (primary auth for web)

Сводка в общем плане: `MASTER_PLAN.md` -> Stage 3.

## Цель этапа

Сделать вход через Telegram Login Widget основным в обычном браузерном вебе, без использования SMS как primary path.

## Scope (только Stage 3)

- Backend endpoint для проверки подписи Login Widget.
- Создание/поиск пользователя и установка сессии.
- UI-компонент кнопки Telegram Login.
- Включение Telegram Login как primary action в `AuthFlowV2`.
- Конфиг через `system_settings` (`telegram_login_bot_username`).

Не включать:

- Логику отключения PIN (Stage 5).
- Политику SMS по типу номера (Stage 4).

## Предусловия

- Stage 2 завершен (для корректного phone fallback UX).
- Доступ к bot token и настройкам в БД подтвержден.

## Подробный план реализации

### S3.T01 - Endpoint валидации подписи

1. Создать `app/api/auth/telegram-login/route.ts`.
2. Принять payload виджета (`id`, `auth_date`, `hash`, профайл-поля).
3. Сформировать `data_check_string` из отсортированных полей без `hash`.
4. Проверить `hash = HMAC-SHA256(SHA256(bot_token), data_check_string)`.
5. Проверить TTL `auth_date` (например <= 1h).
6. Явно обработать невалидную подпись и устаревший payload.
7. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T02 - Session exchange

1. В сервисном слое добавить метод, аналогичный `exchangeTelegramInitData`, но для Login Widget payload.
2. После валидации:
   - `findOrCreateByChannelBinding(channel=telegram, externalId=id)`,
   - установить сессию/cookie,
   - вернуть redirect target.
3. Проверить поведение для существующего пользователя.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T03 - UI button component

1. Создать `shared/ui/auth/TelegramLoginButton.tsx`.
2. Реализовать загрузку скрипта виджета и callback.
3. Поддержать popup/redirect режим.
4. Отдельно обработать loading/error state.
5. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T04 - Включение в AuthFlowV2

1. В `AuthFlowV2` сделать Telegram Login первой кнопкой.
2. Оставить "Войти по номеру телефона" как secondary path.
3. Убедиться, что для пользователя UX очевиден (primary vs secondary).
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T05 - Контекст mini app

1. Использовать `isMessengerMiniAppHost()`.
2. Если это mini app host, не показывать Login Widget.
3. Убедиться, что mini app идет по существующему `initData` flow.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T06 - Привязка к существующему аккаунту

1. Реализовать merge-политику для случаев "раньше входил по телефону, теперь через Telegram Login".
2. Свести дубли к одному `platform_user`.
3. Зафиксировать fallback-путь, если автоматический merge невозможен.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T07 - System settings key

1. Добавить `telegram_login_bot_username` в allowed keys (`system-settings/types.ts`).
2. Проверить доступность через admin settings flow.
3. Не вводить новый env для этого значения.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S3.T08 - Тесты

1. Тест подписи (валидная/невалидная).
2. Тест устаревшего `auth_date`.
3. Тест сессии после успешного login.
4. Тест mini app host: widget не показывается.
5. Прогнать релевантные тесты + `pnpm run ci`.
6. Зафиксировать evidence в `AGENT_EXECUTION_LOG.md`.

## Gate (критерий готовности)

- Telegram Login Widget работает end-to-end в обычном вебе.
- Подпись и TTL проверяются сервером корректно.
- Пользователь получает сессию и редирект без SMS.
- `pnpm run ci` зеленый.

## Артефакты этапа

- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_3.md` (после AUDIT).
- Обновления в `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`.
