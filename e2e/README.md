# E2E: прогон сценариев webhook

Скрипт и тесты отправляют в приложение запросы, эмулирующие Telegram Webhook API, и проверяют ответы. Исходящие вызовы к Telegram перехватываются (мок через подмену `globalThis.fetch`), реальный Telegram не используется.

## Запуск

**Как тесты (Vitest):** сценарии входят в `pnpm test` (файл `e2e/webhook-scenarios.test.ts`).

**Отдельным скриптом:**
```bash
pnpm run scenarios
```

Требуется `.env` в корне с: `DATABASE_URL`, `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `INBOX_CHAT_ID`, `BOOKING_URL`. Опционально: `TG_WEBHOOK_SECRET` — если задан, в запросы подставляется заголовок и проверяется сценарий «неверный секрет → 403».

## Фикстуры

- `fixtures/telegram/*.json` — тела запросов `POST /webhook/telegram` (формат Telegram Webhook).
- Сценарии запускаются по порядку; для части из них важен порядок (например, «вопрос» — после «Задать вопрос», дубликат `update_id` — после первого `/start`).

## Результат

При `pnpm run scenarios`: в stdout список сценариев (✓/✗), код выхода 0/1. При `pnpm test`: отчёт Vitest, тест «runs all fixture scenarios in order» и «wrong secret returns 403…».
